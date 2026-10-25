import { describe, expect, it } from 'vitest';
import { Store } from './db';
import { emptyRequestForTest } from './test-utils';

describe('SQLite persistence', () => {
  it('persists collections, requests, environments, and redacted history metadata', () => {
    const store = new Store(':memory:');
    const collection = store.createCollection('Smoke collection');
    const saved = store.createRequest(collection.id, 'Health check', emptyRequestForTest());
    expect(saved?.name).toBe('Health check');
    expect(store.getRequest(saved!.id)?.definition.method).toBe('GET');

    const environment = store.createEnvironment('Staging', [{ name: 'TOKEN', value: 'secret', sensitive: true }]);
    expect(store.listEnvironments().find((item) => item.id === environment.id)?.variables[0]?.value).toBe('••••••••');
    expect(store.getEnvironmentValues(environment.id)?.TOKEN).toBe('secret');

    const history = store.addHistory({
      requestId: saved!.id,
      executedAt: new Date().toISOString(),
      method: 'GET',
      url: 'https://example.test',
      statusCode: 200,
      statusText: 'OK',
      durationMs: 12,
      responseBytes: 2,
      outcome: 'success',
      errorSummary: null,
      requestSnapshot: emptyRequestForTest()
    });
    expect(store.listHistory()[0]?.id).toBe(history.id);
    store.close();
  });

  it('omits request credentials and bodies from default exports', () => {
    const store = new Store(':memory:');
    const collection = store.createCollection('Export collection');
    store.createRequest(collection.id, 'Secret request', {
      ...emptyRequestForTest(),
      method: 'POST',
      url: 'https://example.test?api_key=secret',
      auth: { type: 'bearer', token: 'secret-token' },
      body: { type: 'json', value: '{"password":"secret"}' }
    });
    const bundle = store.exportBundle(false);
    const definition = bundle.collections[0]?.requests[0]?.definition;
    expect(definition?.auth).toEqual({ type: 'none' });
    expect(definition?.body).toEqual({ type: 'json', value: '[REDACTED]' });
    expect(definition?.url).toContain('%5BREDACTED%5D');
    store.close();
  });
});
