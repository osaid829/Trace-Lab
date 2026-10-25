import type {
  Collection,
  Environment,
  ExportBundle,
  ExecuteResult,
  HistoryEntry,
  RequestDefinition,
  SavedRequest
} from '@tracelab/shared';

let csrfToken = '';

type ApiErrorPayload = { error?: { code?: string; message?: string } };

async function fetchCsrf(): Promise<void> {
  const response = await fetch('/api/csrf');
  const payload = await response.json() as { token?: string };
  if (!response.ok || !payload.token) throw new Error('The local service did not provide a request token.');
  csrfToken = payload.token;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (method !== 'GET' && !csrfToken) await fetchCsrf();
  if (method !== 'GET') headers.set('x-tracelab-token', csrfToken);
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let payload: T & ApiErrorPayload;
  try {
    payload = (text ? JSON.parse(text) : {}) as T & ApiErrorPayload;
  } catch {
    throw new Error(`The local service returned an invalid response (${response.status}).`);
  }
  if (response.status === 403 && method !== 'GET' && retry) {
    await fetchCsrf();
    return request<T>(path, init, false);
  }
  if (!response.ok) throw new Error(payload.error?.message ?? `Request failed with ${response.status}.`);
  return payload;
}

export async function bootstrap(): Promise<{ collections: Collection[]; environments: Environment[]; history: HistoryEntry[] }> {
  await fetchCsrf();
  return request('/api/bootstrap');
}

export function execute(requestDefinition: RequestDefinition, environmentId: string | null, requestId: string | null, signal?: AbortSignal): Promise<ExecuteResult> {
  return request('/api/execute', {
    method: 'POST',
    body: JSON.stringify({ request: requestDefinition, environmentId, requestId }),
    signal
  });
}

export function createCollection(name: string): Promise<Collection> {
  return request('/api/collections', { method: 'POST', body: JSON.stringify({ name }) });
}

export function renameCollection(id: string, name: string): Promise<Collection> {
  return request(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export function deleteCollection(id: string): Promise<{ ok: true }> {
  return request(`/api/collections/${id}`, { method: 'DELETE' });
}

export function saveRequest(collectionId: string, name: string, definition: RequestDefinition): Promise<SavedRequest> {
  return request(`/api/collections/${collectionId}/requests`, { method: 'POST', body: JSON.stringify({ name, definition }) });
}

export function updateRequest(id: string, patch: { name?: string; definition?: RequestDefinition }): Promise<SavedRequest> {
  return request(`/api/requests/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function duplicateRequest(id: string): Promise<SavedRequest> {
  return request(`/api/requests/${id}/duplicate`, { method: 'POST', body: '{}' });
}

export function deleteRequest(id: string): Promise<{ ok: true }> {
  return request(`/api/requests/${id}`, { method: 'DELETE' });
}

export function createEnvironment(name: string, variables: Array<{ id?: string; name: string; value: string; sensitive: boolean }>): Promise<Environment> {
  return request('/api/environments', { method: 'POST', body: JSON.stringify({ name, variables }) });
}

export function updateEnvironment(id: string, name: string, variables: Array<{ id?: string; name: string; value: string; sensitive: boolean }>): Promise<Environment> {
  return request(`/api/environments/${id}`, { method: 'PATCH', body: JSON.stringify({ name, variables }) });
}

export function deleteEnvironment(id: string): Promise<{ ok: true }> {
  return request(`/api/environments/${id}`, { method: 'DELETE' });
}

export function clearHistory(): Promise<{ ok: true }> {
  return request('/api/history', { method: 'DELETE' });
}

export function replayHistory(id: string, environmentId: string | null, signal?: AbortSignal): Promise<ExecuteResult> {
  return request(`/api/history/${id}/replay`, { method: 'POST', body: JSON.stringify({ environmentId }), signal });
}

export function exportBundle(includeSecrets = false): Promise<ExportBundle> {
  return request('/api/export', { method: 'POST', body: JSON.stringify({ includeSecrets }) });
}

export function previewImport(bundle: ExportBundle): Promise<{ applied: false; summary: { collectionsCreated: number; requestsCreated: number; environmentsCreated: number; secretValuesOmitted: number } }> {
  return request('/api/import', { method: 'POST', body: JSON.stringify({ bundle, apply: false }) });
}

export function applyImport(bundle: ExportBundle): Promise<{ applied: true; summary: { collectionsCreated: number; requestsCreated: number; environmentsCreated: number; secretValuesOmitted: number } }> {
  return request('/api/import', { method: 'POST', body: JSON.stringify({ bundle, apply: true }) });
}
