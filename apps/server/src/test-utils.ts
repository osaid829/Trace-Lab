import type { RequestDefinition } from '@tracelab/shared';

export function emptyRequestForTest(): RequestDefinition {
  return {
    method: 'GET',
    url: 'http://127.0.0.1',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none' },
    timeoutMs: 30_000
  };
}
