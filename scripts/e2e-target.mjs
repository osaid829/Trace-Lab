/* global process, setTimeout */
import http from 'node:http';

const port = Number(process.env.TRACELAB_E2E_TARGET_PORT ?? 4320);
const server = http.createServer((request, response) => {
  if (request.url === '/slow') {
    setTimeout(() => response.end('{"slow":true}'), 4_000);
    return;
  }
  if (request.url === '/missing') {
    response.writeHead(404, { 'content-type': 'application/json', 'x-tracelab-target': 'e2e' });
    response.end('{"error":"missing"}');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json', 'x-tracelab-target': 'e2e' });
  response.end(JSON.stringify({ ok: true, method: request.method, path: request.url }));
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`TraceLab E2E target listening on http://127.0.0.1:${port}\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
