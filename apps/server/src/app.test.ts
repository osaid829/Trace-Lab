import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExportBundle } from '@tracelab/shared';
import { buildApp } from './app';
import { Store } from './db';
import { emptyRequestForTest } from './test-utils';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('Fastify API', () => {
  it('creates, executes, and lists a saved request through the local API', async () => {
    const target = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ready":true}');
    });
    servers.push(target);
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', () => resolve()));
    const address = target.address();
    if (!address || typeof address === 'string') throw new Error('No target address');
    const store = new Store(':memory:');
    const app = buildApp({ store, disableCsrf: true, config: { allowPrivateTargets: true } });
    const collection = await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Integration' } });
    expect(collection.statusCode).toBe(201);
    const collectionBody = collection.json<{ id: string }>();
    const definition = { ...emptyRequestForTest(), url: `http://127.0.0.1:${address.port}/health` };
    const saved = await app.inject({ method: 'POST', url: `/api/collections/${collectionBody.id}/requests`, payload: { name: 'Local health', definition } });
    expect(saved.statusCode).toBe(201);
    const savedBody = saved.json<{ id: string }>();
    const executed = await app.inject({ method: 'POST', url: '/api/execute', payload: { requestId: savedBody.id, request: definition, environmentId: null } });
    expect(executed.statusCode).toBe(200);
    expect(executed.json<{ response: { statusCode: number }; error: null }>().response.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/history' })).json<Array<{ requestId: string }>>()[0]?.requestId).toBe(savedBody.id);
    await app.close();
    store.close();
  });

  it('requires the local request token for state changes', async () => {
    const store = new Store(':memory:');
    const app = buildApp({ store });
    const response = await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Blocked' } });
    expect(response.statusCode).toBe(403);
    const csrf = await app.inject({ method: 'GET', url: '/api/csrf' });
    const token = csrf.json<{ token: string }>().token;
    const created = await app.inject({ method: 'POST', url: '/api/collections', headers: { 'x-tracelab-token': token }, payload: { name: 'Allowed' } });
    expect(created.statusCode).toBe(201);
    await app.close();
    store.close();
  });

  it('previews and applies a schema-versioned export without executing requests', async () => {
    const store = new Store(':memory:');
    const app = buildApp({ store, disableCsrf: true });
    const collection = await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Exported' } });
    const collectionId = collection.json<{ id: string }>().id;
    await app.inject({ method: 'POST', url: `/api/collections/${collectionId}/requests`, payload: { name: 'Saved', definition: emptyRequestForTest() } });
    const bundle = (await app.inject({ method: 'POST', url: '/api/export', payload: { includeSecrets: false } })).json<ExportBundle>();
    expect(bundle).toMatchObject({ format: 'tracelab', version: 1 });
    const preview = await app.inject({ method: 'POST', url: '/api/import', payload: { bundle, apply: false } });
    expect(preview.json<{ applied: boolean }>().applied).toBe(false);
    const applied = await app.inject({ method: 'POST', url: '/api/import', payload: { bundle, apply: true } });
    expect(applied.json<{ applied: boolean }>().applied).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/history' })).json<unknown[]>().length).toBe(0);
    await app.close();
    store.close();
  });
});
