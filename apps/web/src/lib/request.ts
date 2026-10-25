import type { AuthConfig, BodyConfig, KeyValueRow, RequestDefinition } from '@tracelab/shared';

let sequence = 0;
export function row(key = '', value = ''): KeyValueRow {
  sequence += 1;
  return { id: `row-${Date.now()}-${sequence}`, key, value, enabled: true };
}

export function emptyRequest(): RequestDefinition {
  return {
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none' },
    timeoutMs: 30_000
  };
}

export function bodyLabel(body: BodyConfig): string {
  if (body.type === 'none') return 'None';
  if (body.type === 'json') return 'JSON';
  if (body.type === 'text') return 'Raw text';
  return 'URL encoded';
}

export function authLabel(auth: AuthConfig): string {
  if (auth.type === 'none') return 'No auth';
  if (auth.type === 'bearer') return 'Bearer token';
  if (auth.type === 'basic') return 'Basic auth';
  return 'API key';
}

export function parseUrlParams(rawUrl: string): KeyValueRow[] {
  if (!rawUrl.trim()) return [];
  try {
    const url = new URL(rawUrl);
    return [...url.searchParams.entries()].map(([key, value]) => row(key, value));
  } catch {
    return [];
  }
}

export function parseUrlParamsIfValid(rawUrl: string): KeyValueRow[] | null {
  if (!rawUrl.trim()) return [];
  try {
    const url = new URL(rawUrl);
    return [...url.searchParams.entries()].map(([key, value]) => row(key, value));
  } catch {
    return null;
  }
}

export function serializeUrlParams(rawUrl: string, params: KeyValueRow[]): string {
  if (!rawUrl.trim()) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.search = '';
    for (const item of params) {
      if (item.enabled && item.key.trim()) url.searchParams.append(item.key, item.value);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function updateRequestParams(request: RequestDefinition, params: KeyValueRow[]): RequestDefinition {
  return { ...request, params, url: serializeUrlParams(request.url, params) };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(value));
}

export function outcomeLabel(outcome: string): string {
  return outcome.replaceAll('-', ' ');
}
