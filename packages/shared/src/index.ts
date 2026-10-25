import { z } from 'zod';

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const KeyValueRowSchema = z.object({
  id: z.string().min(1).max(80),
  key: z.string().max(512),
  value: z.string().max(1_000_000),
  enabled: z.boolean().default(true),
  sensitive: z.boolean().optional()
});
export type KeyValueRow = z.infer<typeof KeyValueRowSchema>;

export const AuthConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string().max(1_000_000) }),
  z.object({ type: z.literal('basic'), username: z.string().max(100_000), password: z.string().max(100_000) }),
  z.object({
    type: z.literal('apiKey'),
    key: z.string().max(512),
    value: z.string().max(1_000_000),
    location: z.enum(['header', 'query'])
  })
]);
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export const BodyConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('json'), value: z.string().max(1_000_000) }),
  z.object({ type: z.literal('text'), value: z.string().max(1_000_000) }),
  z.object({ type: z.literal('urlencoded'), rows: z.array(KeyValueRowSchema).max(200) })
]);
export type BodyConfig = z.infer<typeof BodyConfigSchema>;

export const RequestDefinitionSchema = z.object({
  method: HttpMethodSchema,
  url: z.string().min(1).max(8_000),
  params: z.array(KeyValueRowSchema).max(200),
  headers: z.array(KeyValueRowSchema).max(200),
  auth: AuthConfigSchema,
  body: BodyConfigSchema,
  timeoutMs: z.number().int().min(1_000).max(120_000)
});
export type RequestDefinition = z.infer<typeof RequestDefinitionSchema>;

export const ExecuteRequestSchema = z.object({
  request: RequestDefinitionSchema,
  environmentId: z.string().uuid().nullable().optional(),
  requestId: z.string().uuid().nullable().optional()
});
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

export const SavedRequestSchema = z.object({
  id: z.string().uuid(),
  collectionId: z.string().uuid(),
  name: z.string().min(1).max(200),
  definition: RequestDefinitionSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type SavedRequest = z.infer<typeof SavedRequestSchema>;

export const CollectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.string(),
  updatedAt: z.string(),
  requests: z.array(SavedRequestSchema)
});
export type Collection = z.infer<typeof CollectionSchema>;

export const EnvironmentVariableSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/),
  value: z.string(),
  sensitive: z.boolean()
});
export type EnvironmentVariable = z.infer<typeof EnvironmentVariableSchema>;

export const EnvironmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  isLocal: z.boolean(),
  variables: z.array(EnvironmentVariableSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const HistoryOutcomeSchema = z.enum(['success', 'http-error', 'timeout', 'network-error', 'blocked', 'canceled', 'body-limit', 'validation-error']);
export type HistoryOutcome = z.infer<typeof HistoryOutcomeSchema>;

export const HistoryEntrySchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid().nullable(),
  executedAt: z.string(),
  method: HttpMethodSchema,
  url: z.string(),
  statusCode: z.number().int().nullable(),
  statusText: z.string().nullable(),
  durationMs: z.number().nullable(),
  responseBytes: z.number().int().nullable(),
  outcome: HistoryOutcomeSchema,
  errorSummary: z.string().nullable(),
  requestSnapshot: RequestDefinitionSchema.nullable()
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const ResponseHeaderSchema = z.object({ name: z.string(), value: z.string() });
export const ResponseDataSchema = z.object({
  statusCode: z.number().int(),
  statusText: z.string(),
  headers: z.array(ResponseHeaderSchema),
  body: z.string().nullable(),
  bodyBase64: z.string().nullable(),
  contentType: z.string().nullable(),
  isBinary: z.boolean(),
  responseBytes: z.number().int(),
  durationMs: z.number(),
  finalUrl: z.string(),
  redirectCount: z.number().int(),
  truncated: z.boolean()
});
export type ResponseData = z.infer<typeof ResponseDataSchema>;

export const ExecuteResultSchema = z.object({
  response: ResponseDataSchema.nullable(),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).nullable(),
  history: HistoryEntrySchema
});
export type ExecuteResult = z.infer<typeof ExecuteResultSchema>;

const ExportRequestSchema = z.object({
  name: z.string().min(1).max(200),
  definition: RequestDefinitionSchema
});

const ExportCollectionSchema = z.object({
  name: z.string().min(1).max(200),
  requests: z.array(ExportRequestSchema).max(10_000)
});

const ExportEnvironmentVariableSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/),
  value: z.string().nullable(),
  sensitive: z.boolean()
});

const ExportEnvironmentSchema = z.object({
  name: z.string().min(1).max(200),
  variables: z.array(ExportEnvironmentVariableSchema).max(10_000)
});

export const ExportBundleSchema = z.object({
  format: z.literal('tracelab'),
  version: z.literal(1),
  exportedAt: z.string(),
  includesSecrets: z.boolean(),
  collections: z.array(ExportCollectionSchema).max(1_000),
  environments: z.array(ExportEnvironmentSchema).max(1_000)
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;

export const ImportPayloadSchema = z.object({
  bundle: ExportBundleSchema,
  apply: z.boolean().default(false)
});

export function createId(): string {
  return crypto.randomUUID();
}

export function interpolate(value: string, variables: Record<string, string>): { value: string; missing: string[] } {
  const missing = new Set<string>();
  const result = value.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      missing.add(name);
      return `{{${name}}}`;
    }
    return variables[name] ?? '';
  });
  return { value: result, missing: [...missing] };
}

const SENSITIVE_NAMES = /(authorization|proxy-authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key|signature|client[-_]?secret)/i;

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAMES.test(name);
}

export function redactHeaders(headers: KeyValueRow[]): KeyValueRow[] {
  return headers.map((header) => ({
    ...header,
    value: header.sensitive || isSensitiveName(header.key) ? '[REDACTED]' : header.value
  }));
}

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    const entries = [...url.searchParams.entries()].map(([key, value]) => [key, isSensitiveName(key) ? '[REDACTED]' : value] as const);
    url.search = '';
    for (const [key, value] of entries) url.searchParams.append(key, value);
    return url.toString();
  } catch {
    return '[INVALID URL]';
  }
}

export function sanitizeRequestForHistory(request: RequestDefinition): RequestDefinition {
  const params = request.params.map((item) => ({
    ...item,
    value: item.sensitive || isSensitiveName(item.key) ? '[REDACTED]' : item.value
  }));
  const body = request.body.type === 'none'
    ? request.body
    : request.body.type === 'urlencoded'
      ? { type: 'urlencoded' as const, rows: request.body.rows.map((item) => ({ ...item, value: '[REDACTED]' })) }
      : { type: request.body.type, value: '[REDACTED]' };
  return {
    ...request,
    url: redactUrl(request.url),
    params,
    headers: redactHeaders(request.headers),
    auth: { type: 'none' },
    body
  };
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, '$1=[REDACTED]')
    .replace(/\b(?:bearer|basic)\s+[^\s,;]+/gi, (match) => `${match.split(/\s+/)[0]} [REDACTED]`)
    .replace(/\b(token|secret|password|passwd|api[-_]?key|signature|client[-_]?secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrl(match));
}
