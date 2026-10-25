import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { executeRequest, ExecutionError } from './executor';
import { emptyRequestForTest } from './test-utils';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function startServer(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test server address');
    resolve(`http://127.0.0.1:${address.port}`);
  }));
}

describe('HTTP execution', () => {
  it('returns non-2xx HTTP responses as real responses', async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(404, { 'content-type': 'application/json', 'x-test': 'present' });
      response.end(JSON.stringify({ error: 'missing' }));
    });
    const result = await executeRequest({ ...emptyRequestForTest(), url: `${baseUrl}/missing` }, {
      allowPrivateTargets: true,
      maxRequestBytes: 1024,
      maxResponseBytes: 1024,
      maxRedirects: 2
    });
    expect(result.statusCode).toBe(404);
    expect(result.body).toContain('missing');
    expect(result.headers).toContainEqual({ name: 'x-test', value: 'present' });
  });

  it('stops a request when the timeout expires', async () => {
    const baseUrl = await startServer((_request, _response) => {
      // Keep the socket open so the executor must enforce its own timeout.
    });
    await expect(executeRequest({ ...emptyRequestForTest(), url: baseUrl, timeoutMs: 1_000 }, {
      allowPrivateTargets: true,
      maxRequestBytes: 1024,
      maxResponseBytes: 1024,
      maxRedirects: 2
    })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejects oversized response bodies', async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('0123456789');
    });
    await expect(executeRequest({ ...emptyRequestForTest(), url: baseUrl }, {
      allowPrivateTargets: true,
      maxRequestBytes: 1024,
      maxResponseBytes: 5,
      maxRedirects: 2
    })).rejects.toMatchObject({ code: 'BODY_LIMIT' });
  });

  it('constructs auth, repeated query parameters, and JSON bodies', async () => {
    const baseUrl = await startServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ authorization: request.headers.authorization, query: request.url, body }));
      });
    });
    const result = await executeRequest({
      ...emptyRequestForTest(),
      method: 'POST',
      url: `${baseUrl}/inspect`,
      params: [{ id: 'a', key: 'tag', value: 'one', enabled: true }, { id: 'b', key: 'tag', value: 'two', enabled: true }],
      auth: { type: 'bearer', token: '{{TOKEN}}' },
      body: { type: 'json', value: '{"ok":true}' }
    }, {
      variables: { TOKEN: 'secret' },
      allowPrivateTargets: true,
      maxRequestBytes: 1024,
      maxResponseBytes: 4096,
      maxRedirects: 2
    });
    expect(result.body).toContain('Bearer secret');
    expect(result.body).toContain('/inspect?tag=one&tag=two');
    expect(JSON.parse(result.body ?? '{}').body).toBe('{"ok":true}');
  });

  it('reports missing variables before network execution', async () => {
    await expect(executeRequest({ ...emptyRequestForTest(), url: 'https://{{HOST}}/health' }, {
      allowPrivateTargets: false,
      maxRequestBytes: 1024,
      maxResponseBytes: 1024,
      maxRedirects: 2
    })).rejects.toMatchObject({ code: 'MISSING_VARIABLE' });
  });

  it('follows and revalidates bounded redirects', async () => {
    const baseUrl = await startServer((request, response) => {
      if (request.url === '/start') {
        response.writeHead(302, { location: '/final' });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('redirected');
    });
    const result = await executeRequest({ ...emptyRequestForTest(), url: `${baseUrl}/start` }, {
      allowPrivateTargets: true,
      maxRequestBytes: 1024,
      maxResponseBytes: 1024,
      maxRedirects: 2
    });
    expect(result.redirectCount).toBe(1);
    expect(result.body).toBe('redirected');
  });
});
