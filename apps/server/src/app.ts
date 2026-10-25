import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ExecuteRequestSchema,
  ImportPayloadSchema,
  RequestDefinitionSchema,
  sanitizeErrorMessage,
  sanitizeRequestForHistory,
  redactUrl,
  type ExportBundle,
  type HistoryEntry
} from '@tracelab/shared';
import { Store } from './db.js';
import { loadConfig, type ServerConfig } from './config.js';
import { executeRequest, ExecutionError } from './executor.js';
import { z } from 'zod';

const NameSchema = z.string().trim().min(1).max(200);
const IdSchema = z.string().uuid();
const CollectionNamePayloadSchema = z.object({ name: NameSchema });
const CreateRequestPayloadSchema = z.object({ name: NameSchema, definition: RequestDefinitionSchema });
const UpdateRequestPayloadSchema = z.object({
  name: NameSchema.optional(),
  definition: RequestDefinitionSchema.optional(),
  collectionId: IdSchema.optional()
});
const EnvironmentVariableInputSchema = z.object({
  id: IdSchema.optional(),
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/),
  value: z.string().max(1_000_000),
  sensitive: z.boolean()
});
const EnvironmentPayloadSchema = z.object({ name: NameSchema, variables: z.array(EnvironmentVariableInputSchema).max(200) });
const ExportPayloadSchema = z.object({ includeSecrets: z.boolean().default(false) });
const ImportSummarySchema = z.object({
  collectionsCreated: z.number().int(),
  requestsCreated: z.number().int(),
  environmentsCreated: z.number().int(),
  secretValuesOmitted: z.number().int()
});
const ReplayPayloadSchema = z.object({ environmentId: IdSchema.nullable().optional() });

function outcomeForError(code: string): HistoryEntry['outcome'] {
  if (code === 'TIMEOUT') return 'timeout';
  if (code === 'CANCELED') return 'canceled';
  if (code === 'BODY_LIMIT') return 'body-limit';
  if (code === 'TARGET_BLOCKED' || code === 'REDIRECT_BLOCKED' || code === 'DNS_RESOLUTION_FAILED') return 'blocked';
  if (code === 'VALIDATION_ERROR' || code === 'MISSING_VARIABLE') return 'validation-error';
  return 'network-error';
}

function badRequest(message: string): { error: { code: string; message: string } } {
  return { error: { code: 'INVALID_REQUEST', message } };
}

function invalidId(value: unknown): boolean {
  return !IdSchema.safeParse(value).success;
}

function importSummary(bundle: ExportBundle): z.infer<typeof ImportSummarySchema> {
  return {
    collectionsCreated: bundle.collections.length,
    requestsCreated: bundle.collections.reduce((total, collection) => total + collection.requests.length, 0),
    environmentsCreated: bundle.environments.length,
    secretValuesOmitted: bundle.environments.reduce((total, environment) => total + environment.variables.filter((variable) => variable.sensitive && variable.value === null).length, 0)
  };
}

export type BuildAppOptions = {
  store?: Store;
  config?: Partial<ServerConfig>;
  disableCsrf?: boolean;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = loadConfig(options.config);
  const ownsStore = !options.store;
  const store = options.store ?? new Store(config.databasePath);
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const allowedOrigins = new Set([config.webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173']);
  const app = Fastify({ logger: false, bodyLimit: config.maxRequestBytes + 256_000 });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-headers', 'content-type,x-tracelab-token');
      reply.header('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    }
    reply.header('vary', 'Origin');
    if (request.method === 'OPTIONS') return reply.code(204).send();
    if (options.disableCsrf || !request.url.startsWith('/api/') || request.method === 'GET') return;
    if (origin && !allowedOrigins.has(origin)) return reply.code(403).send(badRequest('This origin is not allowed to use the local service.'));
    if (request.headers['x-tracelab-token'] !== csrfToken) return reply.code(403).send(badRequest('A valid local request token is required.'));
  });

  app.addHook('onClose', async () => {
    if (ownsStore) store.close();
  });

  app.get('/healthz', async () => ({ ok: true, service: 'tracelab-server', version: '0.1.0' }));
  app.get('/api/csrf', async () => ({ token: csrfToken }));
  app.get('/api/bootstrap', async () => ({ collections: store.listCollections(), environments: store.listEnvironments(), history: store.listHistory() }));

  app.get('/api/collections', async () => store.listCollections());
  app.post('/api/collections', async (request, reply) => {
    const parsed = CollectionNamePayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('Collection names must be 1-200 characters.'));
    return reply.code(201).send(store.createCollection(parsed.data.name));
  });
  app.patch('/api/collections/:id', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    const body = CollectionNamePayloadSchema.safeParse(request.body);
    if (invalidId(id)) return reply.code(400).send(badRequest('The collection id is invalid.'));
    if (!body.success) return reply.code(400).send(badRequest('Collection names must be 1-200 characters.'));
    const collection = store.renameCollection(String(id), body.data.name);
    return collection ? collection : reply.code(404).send(badRequest('Collection not found.'));
  });
  app.delete('/api/collections/:id', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The collection id is invalid.'));
    const deleted = store.deleteCollection(String(id));
    return deleted ? { ok: true } : reply.code(404).send(badRequest('Collection not found.'));
  });

  app.post('/api/collections/:id/requests', async (request, reply) => {
    const collectionId = (request.params as { id?: unknown }).id;
    if (invalidId(collectionId)) return reply.code(400).send(badRequest('The collection id is invalid.'));
    const parsed = CreateRequestPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('The request name or definition is invalid.'));
    const saved = store.createRequest(String(collectionId), parsed.data.name, parsed.data.definition);
    return saved ? reply.code(201).send(saved) : reply.code(404).send(badRequest('Collection not found.'));
  });
  app.get('/api/requests/:id', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The request id is invalid.'));
    const saved = store.getRequest(String(id));
    return saved ? saved : reply.code(404).send(badRequest('Request not found.'));
  });
  app.patch('/api/requests/:id', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The request id is invalid.'));
    const parsed = UpdateRequestPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('The request update is invalid.'));
    const saved = store.updateRequest(String(id), parsed.data);
    return saved ? saved : reply.code(404).send(badRequest('Request not found.'));
  });
  app.post('/api/requests/:id/duplicate', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The request id is invalid.'));
    const saved = store.duplicateRequest(String(id));
    return saved ? reply.code(201).send(saved) : reply.code(404).send(badRequest('Request not found.'));
  });
  app.delete('/api/requests/:id', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The request id is invalid.'));
    const deleted = store.deleteRequest(String(id));
    return deleted ? { ok: true } : reply.code(404).send(badRequest('Request not found.'));
  });

  app.get('/api/environments', async () => store.listEnvironments());
  app.post('/api/environments', async (request, reply) => {
    const parsed = EnvironmentPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('Environment names or variables are invalid.'));
    try {
      return reply.code(201).send(store.createEnvironment(parsed.data.name, parsed.data.variables.map(({ name, value, sensitive }) => ({ name, value, sensitive }))));
    } catch {
      return reply.code(409).send(badRequest('An environment with that name already exists.'));
    }
  });
  app.patch('/api/environments/:id', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The environment id is invalid.'));
    const parsed = EnvironmentPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('Environment names or variables are invalid.'));
    const oldValues = store.getEnvironmentValues(String(id));
    if (oldValues === null) return reply.code(404).send(badRequest('Environment not found.'));
    try {
      const variables = parsed.data.variables.map((variable) => ({
        id: variable.id,
        name: variable.name,
        value: variable.value === '••••••••' ? oldValues[variable.name] ?? '' : variable.value,
        sensitive: variable.sensitive
      }));
      const environment = store.updateEnvironment(String(id), parsed.data.name, variables);
      return environment ? environment : reply.code(404).send(badRequest('Environment not found.'));
    } catch {
      return reply.code(409).send(badRequest('An environment with that name already exists.'));
    }
  });
  app.delete('/api/environments/:id', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The environment id is invalid.'));
    const deleted = store.deleteEnvironment(String(id));
    return deleted ? { ok: true } : reply.code(400).send(badRequest('The Local environment cannot be deleted, or the environment was not found.'));
  });

  app.get('/api/history', async () => store.listHistory());
  app.delete('/api/history', async () => {
    store.clearHistory();
    return { ok: true };
  });

  app.post('/api/export', async (request, reply) => {
    const parsed = ExportPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('Export options are invalid.'));
    return store.exportBundle(parsed.data.includeSecrets);
  });

  app.post('/api/import', async (request, reply) => {
    const parsed = ImportPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('The TraceLab export is invalid or unsupported.'));
    const summary = importSummary(parsed.data.bundle);
    if (!parsed.data.apply) return { applied: false, summary };
    return { applied: true, summary: store.importBundle(parsed.data.bundle) };
  });

  app.post('/api/execute', async (request, reply) => {
    const parsed = ExecuteRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(badRequest('The request definition is invalid.'));
    const requestDefinition = parsed.data.request;
    const requestId = parsed.data.requestId ?? null;
    const variables = parsed.data.environmentId ? store.getEnvironmentValues(parsed.data.environmentId) : {};
    if (parsed.data.environmentId && variables === null) return reply.code(400).send(badRequest('The selected environment was not found.'));
    const abortController = new AbortController();
    const abortHandler = () => abortController.abort();
    request.raw.once('aborted', abortHandler);
    const started = performance.now();
    try {
      const response = await executeRequest(requestDefinition, {
        variables: variables ?? {},
        allowPrivateTargets: config.allowPrivateTargets,
        maxResponseBytes: config.maxResponseBytes,
        maxRequestBytes: config.maxRequestBytes,
        maxRedirects: config.maxRedirects,
        signal: abortController.signal
      });
      const history = store.addHistory({
        requestId,
        executedAt: new Date().toISOString(),
        method: requestDefinition.method,
        url: redactUrl(requestDefinition.url),
        statusCode: response.statusCode,
        statusText: response.statusText,
        durationMs: response.durationMs,
        responseBytes: response.responseBytes,
        outcome: response.statusCode >= 400 ? 'http-error' : 'success',
        errorSummary: null,
        requestSnapshot: sanitizeRequestForHistory(requestDefinition)
      });
      return { response, error: null, history };
    } catch (error) {
      const executionError = error instanceof ExecutionError ? error : new ExecutionError('NETWORK_ERROR', 'The request failed unexpectedly.');
      const safeMessage = sanitizeErrorMessage(executionError.message);
      const history = store.addHistory({
        requestId,
        executedAt: new Date().toISOString(),
        method: requestDefinition.method,
        url: redactUrl(requestDefinition.url),
        statusCode: null,
        statusText: null,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        responseBytes: null,
        outcome: outcomeForError(executionError.code),
        errorSummary: safeMessage,
        requestSnapshot: sanitizeRequestForHistory(requestDefinition)
      });
      return { response: null, error: { code: executionError.code, message: safeMessage }, history };
    } finally {
      request.raw.removeListener('aborted', abortHandler);
    }
  });

  app.post('/api/history/:id/replay', async (request, reply) => {
    const id = (request.params as { id?: unknown }).id;
    if (invalidId(id)) return reply.code(400).send(badRequest('The history id is invalid.'));
    const history = store.getHistory(String(id));
    if (!history || !history.requestId) return reply.code(400).send(badRequest('This history entry is not linked to a saved request and cannot be replayed safely.'));
    const saved = store.getRequest(history.requestId);
    if (!saved) return reply.code(404).send(badRequest('The saved request for this history entry no longer exists.'));
    const parsed = ReplayPayloadSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(badRequest('The selected environment is invalid.'));
    const variables = parsed.data.environmentId ? store.getEnvironmentValues(parsed.data.environmentId) : {};
    if (parsed.data.environmentId && variables === null) return reply.code(400).send(badRequest('The selected environment was not found.'));
    const abortController = new AbortController();
    const abortHandler = () => abortController.abort();
    request.raw.once('aborted', abortHandler);
    const started = performance.now();
    try {
      const response = await executeRequest(saved.definition, {
        variables: variables ?? {},
        allowPrivateTargets: config.allowPrivateTargets,
        maxResponseBytes: config.maxResponseBytes,
        maxRequestBytes: config.maxRequestBytes,
        maxRedirects: config.maxRedirects,
        signal: abortController.signal
      });
      const nextHistory = store.addHistory({
        requestId: saved.id,
        executedAt: new Date().toISOString(),
        method: saved.definition.method,
        url: redactUrl(saved.definition.url),
        statusCode: response.statusCode,
        statusText: response.statusText,
        durationMs: response.durationMs,
        responseBytes: response.responseBytes,
        outcome: response.statusCode >= 400 ? 'http-error' : 'success',
        errorSummary: null,
        requestSnapshot: sanitizeRequestForHistory(saved.definition)
      });
      return { response, error: null, history: nextHistory };
    } catch (error) {
      const executionError = error instanceof ExecutionError ? error : new ExecutionError('NETWORK_ERROR', 'The request failed unexpectedly.');
      const safeMessage = sanitizeErrorMessage(executionError.message);
      const nextHistory = store.addHistory({
        requestId: saved.id,
        executedAt: new Date().toISOString(),
        method: saved.definition.method,
        url: redactUrl(saved.definition.url),
        statusCode: null,
        statusText: null,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        responseBytes: null,
        outcome: outcomeForError(executionError.code),
        errorSummary: safeMessage,
        requestSnapshot: sanitizeRequestForHistory(saved.definition)
      });
      return { response: null, error: { code: executionError.code, message: safeMessage }, history: nextHistory };
    } finally {
      request.raw.removeListener('aborted', abortHandler);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && 'code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send(badRequest('The request payload is too large.'));
    if (error instanceof Error && 'code' in error && error.code === 'FST_ERR_CTP_INVALID_JSON_BODY') return reply.code(400).send(badRequest('The request body must be valid JSON.'));
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The local service encountered an unexpected error.' } });
  });

  return app;
}
