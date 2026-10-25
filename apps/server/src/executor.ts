import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { interpolate, type AuthConfig, type BodyConfig, type RequestDefinition, type ResponseData } from '@tracelab/shared';
import { createPinnedLookup, isSameOrigin, PolicyError, validateTarget, type Lookup, type ResolvedTarget } from './security/net-policy.js';

export class ExecutionError extends Error {
  constructor(
    public readonly code: 'MISSING_VARIABLE' | 'VALIDATION_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR' | 'CANCELED' | 'BODY_LIMIT' | 'TARGET_BLOCKED' | 'DNS_RESOLUTION_FAILED' | 'REDIRECT_BLOCKED',
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

type HeaderValue = string | string[];

type PreparedRequest = {
  url: URL;
  headers: Record<string, HeaderValue>;
  body: string | undefined;
};

export type ExecutionOptions = {
  variables?: Record<string, string>;
  allowPrivateTargets: boolean;
  maxResponseBytes: number;
  maxRequestBytes: number;
  maxRedirects: number;
  signal?: AbortSignal;
  lookup?: Lookup;
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length'
]);

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const UNRESOLVED_VARIABLE = /\{\{[^}]+\}\}/;

function interpolateOrThrow(value: string, variables: Record<string, string>, missing: Set<string>): string {
  const result = interpolate(value, variables);
  for (const name of result.missing) missing.add(name);
  return result.value;
}

function headerKey(headers: Record<string, HeaderValue>, key: string): string | undefined {
  return Object.keys(headers).find((existing) => existing.toLowerCase() === key.toLowerCase());
}

function hasHeader(headers: Record<string, HeaderValue>, key: string): boolean {
  return headerKey(headers, key) !== undefined;
}

function setHeader(headers: Record<string, HeaderValue>, key: string, value: string): void {
  const existing = headerKey(headers, key);
  if (existing && existing !== key) delete headers[existing];
  headers[key] = value;
}

function addHeader(headers: Record<string, HeaderValue>, key: string, value: string): void {
  const existing = headerKey(headers, key);
  if (!existing) {
    headers[key] = value;
    return;
  }
  const current = headers[existing];
  headers[existing] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
}

function deleteHeader(headers: Record<string, HeaderValue>, key: string): void {
  const existing = headerKey(headers, key);
  if (existing) delete headers[existing];
}

function validateHeaderName(key: string): void {
  if (!key) throw new ExecutionError('VALIDATION_ERROR', 'Enabled headers need a name.');
  if (!HEADER_NAME.test(key)) throw new ExecutionError('VALIDATION_ERROR', `Invalid header name: ${key}`);
  if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) throw new ExecutionError('VALIDATION_ERROR', `TraceLab manages the ${key} header.`);
}

function prepareBody(body: BodyConfig, variables: Record<string, string>, headers: Record<string, HeaderValue>, method: RequestDefinition['method'], missing: Set<string>): string | undefined {
  if (body.type === 'none') return undefined;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) throw new ExecutionError('VALIDATION_ERROR', `${method} requests cannot include a request body in TraceLab.`);
  if (body.type === 'json') {
    const value = interpolateOrThrow(body.value, variables, missing);
    if (!UNRESOLVED_VARIABLE.test(value)) {
      try {
        JSON.parse(value);
      } catch {
        throw new ExecutionError('VALIDATION_ERROR', 'The JSON request body is not valid JSON.');
      }
    }
    if (!hasHeader(headers, 'content-type')) setHeader(headers, 'content-type', 'application/json');
    return value;
  }
  if (body.type === 'text') {
    if (!hasHeader(headers, 'content-type')) setHeader(headers, 'content-type', 'text/plain; charset=utf-8');
    return interpolateOrThrow(body.value, variables, missing);
  }
  const params = new URLSearchParams();
  for (const row of body.rows) {
    if (!row.enabled) continue;
    const key = interpolateOrThrow(row.key.trim(), variables, missing);
    const value = interpolateOrThrow(row.value, variables, missing);
    if (!key && !UNRESOLVED_VARIABLE.test(key)) throw new ExecutionError('VALIDATION_ERROR', 'Enabled form fields need a name.');
    if (!UNRESOLVED_VARIABLE.test(key)) params.append(key, value);
  }
  if (!hasHeader(headers, 'content-type')) setHeader(headers, 'content-type', 'application/x-www-form-urlencoded');
  return params.toString();
}

function applyAuth(auth: AuthConfig, url: URL, headers: Record<string, HeaderValue>, variables: Record<string, string>, missing: Set<string>): void {
  if (auth.type === 'none') return;
  if (auth.type === 'bearer') {
    setHeader(headers, 'authorization', `Bearer ${interpolateOrThrow(auth.token, variables, missing)}`);
    return;
  }
  if (auth.type === 'basic') {
    const username = interpolateOrThrow(auth.username, variables, missing);
    const password = interpolateOrThrow(auth.password, variables, missing);
    setHeader(headers, 'authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
    return;
  }
  const key = interpolateOrThrow(auth.key.trim(), variables, missing);
  const value = interpolateOrThrow(auth.value, variables, missing);
  if (!key && !UNRESOLVED_VARIABLE.test(key)) throw new ExecutionError('VALIDATION_ERROR', 'API key names need a value.');
  if (auth.location === 'header') {
    if (!UNRESOLVED_VARIABLE.test(key)) validateHeaderName(key);
    if (!UNRESOLVED_VARIABLE.test(key)) setHeader(headers, key, value);
  } else if (!UNRESOLVED_VARIABLE.test(key)) {
    url.searchParams.append(key, value);
  }
}

function prepareRequest(request: RequestDefinition, variables: Record<string, string>): PreparedRequest {
  const missing = new Set<string>();
  const rawUrl = interpolateOrThrow(request.url.trim(), variables, missing);
  if (missing.size > 0) throw new ExecutionError('MISSING_VARIABLE', `Missing environment variable${missing.size === 1 ? '' : 's'}: ${[...missing].join(', ')}`);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ExecutionError('VALIDATION_ERROR', 'Enter a valid absolute URL.');
  }

  const headers: Record<string, HeaderValue> = {};
  for (const row of request.headers) {
    if (!row.enabled) continue;
    const key = interpolateOrThrow(row.key.trim(), variables, missing);
    const value = interpolateOrThrow(row.value, variables, missing);
    if (UNRESOLVED_VARIABLE.test(key)) continue;
    validateHeaderName(key);
    if (/[\r\n]/.test(value)) throw new ExecutionError('VALIDATION_ERROR', `Invalid line break in header: ${key}`);
    addHeader(headers, key, value);
  }

  if (request.params.length > 0) {
    url.search = '';
    for (const row of request.params) {
      if (!row.enabled) continue;
      const key = interpolateOrThrow(row.key.trim(), variables, missing);
      const value = interpolateOrThrow(row.value, variables, missing);
      if (!key && !UNRESOLVED_VARIABLE.test(key)) throw new ExecutionError('VALIDATION_ERROR', 'Enabled query parameters need a name.');
      if (!UNRESOLVED_VARIABLE.test(key)) url.searchParams.append(key, value);
    }
  }

  const body = prepareBody(request.body, variables, headers, request.method, missing);
  applyAuth(request.auth, url, headers, variables, missing);
  if (missing.size > 0) throw new ExecutionError('MISSING_VARIABLE', `Missing environment variable${missing.size === 1 ? '' : 's'}: ${[...missing].join(', ')}`);
  return { url, headers, body };
}

function responseHeaderList(headers: http.IncomingHttpHeaders): Array<{ name: string; value: string }> {
  return Object.entries(headers).flatMap(([name, value]) => {
    if (Array.isArray(value)) return value.map((item) => ({ name, value: item }));
    return value === undefined ? [] : [{ name, value }];
  });
}

function isTextContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const normalized = contentType.toLowerCase();
  return normalized.startsWith('text/') || normalized.includes('json') || normalized.includes('xml') || normalized.includes('javascript') || normalized.includes('x-www-form-urlencoded');
}

function decodeBody(buffer: Buffer, contentEncoding: string | undefined): Buffer {
  if (!contentEncoding || contentEncoding === 'identity') return buffer;
  try {
    if (contentEncoding.includes('gzip')) return zlib.gunzipSync(buffer);
    if (contentEncoding.includes('deflate')) return zlib.inflateSync(buffer);
    if (contentEncoding.includes('br')) return zlib.brotliDecompressSync(buffer);
  } catch {
    return buffer;
  }
  return buffer;
}

function readResponse(response: http.IncomingMessage, maxResponseBytes: number): Promise<{ raw: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    response.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxResponseBytes) {
        rejectOnce(new ExecutionError('BODY_LIMIT', `The response exceeded the ${maxResponseBytes.toLocaleString()} byte limit.`));
        response.destroy();
        return;
      }
      chunks.push(buffer);
    });
    response.on('end', () => {
      if (settled) return;
      settled = true;
      resolve({ raw: Buffer.concat(chunks), headers: response.headers });
    });
    response.on('aborted', () => rejectOnce(new ExecutionError('NETWORK_ERROR', 'The target server closed the response before it completed.')));
    response.on('error', rejectOnce);
  });
}

function sanitizeRedirectUrl(url: URL, crossOrigin: boolean): URL {
  if (!crossOrigin) return url;
  const entries = [...url.searchParams.entries()].filter(([key]) => !/(token|secret|password|api[-_]?key|signature|code)/i.test(key));
  url.search = '';
  for (const [key, value] of entries) url.searchParams.append(key, value);
  return url;
}

function hostForRequest(url: URL): string {
  return url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname;
}

async function requestHop(
  prepared: PreparedRequest,
  target: ResolvedTarget,
  method: RequestDefinition['method'],
  body: string | undefined,
  signal: AbortSignal,
  maxResponseBytes: number
): Promise<{ statusCode: number; statusText: string; headers: http.IncomingHttpHeaders; rawBody: Buffer }> {
  return new Promise((resolve, reject) => {
    const transport = prepared.url.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: prepared.url.protocol,
      hostname: hostForRequest(prepared.url),
      port: prepared.url.port || undefined,
      path: `${prepared.url.pathname}${prepared.url.search}`,
      method,
      headers: prepared.headers,
      agent: false,
      lookup: createPinnedLookup(target),
      servername: prepared.url.protocol === 'https:' ? hostForRequest(prepared.url) : undefined,
      signal
    }, async (response) => {
      try {
        const result = await readResponse(response, maxResponseBytes);
        resolve({ statusCode: response.statusCode ?? 0, statusText: response.statusMessage ?? '', headers: result.headers, rawBody: result.raw });
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function mapPolicyError(error: PolicyError): ExecutionError {
  if (error.code === 'TARGET_BLOCKED') return new ExecutionError('TARGET_BLOCKED', error.message);
  if (error.code === 'DNS_RESOLUTION_FAILED') return new ExecutionError('DNS_RESOLUTION_FAILED', error.message);
  if (error.code === 'UNSUPPORTED_PROTOCOL') return new ExecutionError('VALIDATION_ERROR', error.message);
  return new ExecutionError('VALIDATION_ERROR', error.message);
}

export async function executeRequest(request: RequestDefinition, options: ExecutionOptions): Promise<ResponseData> {
  const started = performance.now();
  const variables = options.variables ?? {};
  if (options.signal?.aborted) throw new ExecutionError('CANCELED', 'The request was canceled.');
  const prepared = prepareRequest(request, variables);
  const bodyBytes = prepared.body ? Buffer.byteLength(prepared.body) : 0;
  const headerBytes = Object.entries(prepared.headers).reduce((total, [key, value]) => total + Buffer.byteLength(key) + Buffer.byteLength(Array.isArray(value) ? value.join(',') : value), 0);
  if (bodyBytes + headerBytes > options.maxRequestBytes) throw new ExecutionError('BODY_LIMIT', `The request exceeded the ${options.maxRequestBytes.toLocaleString()} byte limit.`);

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);

  try {
    let currentUrl = prepared.url;
    let currentMethod = request.method;
    let currentBody = prepared.body;
    let currentHeaders: Record<string, HeaderValue> = { ...prepared.headers };
    let redirectCount = 0;
    const visited = new Set<string>([currentUrl.toString()]);

    while (true) {
      const currentPrepared: PreparedRequest = { url: currentUrl, headers: currentHeaders, body: currentBody };
      let target: ResolvedTarget;
      try {
        target = await validateTarget(currentUrl.toString(), options.allowPrivateTargets, options.lookup);
      } catch (error) {
        if (error instanceof PolicyError) throw mapPolicyError(error);
        throw error;
      }

      let hop;
      try {
        hop = await requestHop(currentPrepared, target, currentMethod, currentBody, controller.signal, options.maxResponseBytes);
      } catch (error) {
        if (error instanceof ExecutionError) throw error;
        if (controller.signal.aborted) {
          if (options.signal?.aborted) throw new ExecutionError('CANCELED', 'The request was canceled.');
          throw new ExecutionError('TIMEOUT', 'The request timed out.');
        }
        throw new ExecutionError('NETWORK_ERROR', 'The target server could not be reached.');
      }

      const locationValue = hop.headers.location;
      const location = Array.isArray(locationValue) ? locationValue[0] : locationValue;
      if (location && [301, 302, 303, 307, 308].includes(hop.statusCode)) {
        if (redirectCount >= options.maxRedirects) throw new ExecutionError('REDIRECT_BLOCKED', 'The redirect limit was reached.');
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new ExecutionError('REDIRECT_BLOCKED', 'The server returned an invalid redirect destination.');
        }
        if (!['http:', 'https:'].includes(nextUrl.protocol)) throw new ExecutionError('REDIRECT_BLOCKED', 'The server returned an unsupported redirect scheme.');
        const crossOrigin = !isSameOrigin(currentUrl, nextUrl);
        nextUrl = sanitizeRedirectUrl(nextUrl, crossOrigin);
        const key = nextUrl.toString();
        if (visited.has(key)) throw new ExecutionError('REDIRECT_BLOCKED', 'The server returned a redirect loop.');
        visited.add(key);
        redirectCount += 1;
        if (crossOrigin) {
          for (const header of ['authorization', 'cookie', 'proxy-authorization', 'set-cookie']) deleteHeader(currentHeaders, header);
        }
        if ([301, 302, 303].includes(hop.statusCode) && !['GET', 'HEAD'].includes(currentMethod)) {
          currentMethod = 'GET';
          currentBody = undefined;
          deleteHeader(currentHeaders, 'content-type');
        }
        currentUrl = nextUrl;
        continue;
      }

      const contentTypeHeader = hop.headers['content-type'];
      const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] ?? null : contentTypeHeader ?? null;
      const contentEncodingHeader = hop.headers['content-encoding'];
      const contentEncoding = Array.isArray(contentEncodingHeader) ? contentEncodingHeader[0] : contentEncodingHeader;
      const decoded = decodeBody(hop.rawBody, contentEncoding);
      if (decoded.length > options.maxResponseBytes) throw new ExecutionError('BODY_LIMIT', `The response exceeded the ${options.maxResponseBytes.toLocaleString()} byte limit.`);
      const isBinary = !isTextContentType(contentType);
      const durationMs = Math.round((performance.now() - started) * 100) / 100;
      return {
        statusCode: hop.statusCode,
        statusText: hop.statusText,
        headers: responseHeaderList(hop.headers),
        body: isBinary ? null : decoded.toString('utf8'),
        bodyBase64: isBinary ? decoded.toString('base64') : null,
        contentType,
        isBinary,
        responseBytes: decoded.length,
        durationMs,
        finalUrl: currentUrl.toString(),
        redirectCount,
        truncated: false
      };
    }
  } catch (error) {
    if (error instanceof ExecutionError) throw error;
    if (controller.signal.aborted) {
      if (options.signal?.aborted) throw new ExecutionError('CANCELED', 'The request was canceled.');
      throw new ExecutionError(timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', timedOut ? 'The request timed out.' : 'The target server could not be reached.');
    }
    throw new ExecutionError('NETWORK_ERROR', 'The target server could not be reached.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
