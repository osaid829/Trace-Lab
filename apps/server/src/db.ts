import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  createId,
  ExportBundleSchema,
  RequestDefinitionSchema,
  sanitizeRequestForHistory,
  type Collection,
  type Environment,
  type ExportBundle,
  type HistoryEntry,
  type RequestDefinition,
  type SavedRequest
} from '@tracelab/shared';

type CollectionRow = { id: string; name: string; created_at: string; updated_at: string };
type RequestRow = { id: string; collection_id: string; name: string; definition_json: string; created_at: string; updated_at: string };
type EnvironmentRow = { id: string; name: string; is_local: number; created_at: string; updated_at: string };
type VariableRow = { id: string; environment_id: string; name: string; value: string; sensitive: number };
type HistoryRow = {
  id: string;
  request_id: string | null;
  executed_at: string;
  method: string;
  url: string;
  status_code: number | null;
  status_text: string | null;
  duration_ms: number | null;
  response_bytes: number | null;
  outcome: string;
  error_summary: string | null;
  request_snapshot_json: string | null;
};

const HISTORY_LIMIT = 100;

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_requests (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_local INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS environment_variables (
        id TEXT PRIMARY KEY,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        sensitive INTEGER NOT NULL DEFAULT 0,
        UNIQUE(environment_id, name)
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        request_id TEXT REFERENCES saved_requests(id) ON DELETE SET NULL,
        executed_at TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        status_code INTEGER,
        status_text TEXT,
        duration_ms REAL,
        response_bytes INTEGER,
        outcome TEXT NOT NULL,
        error_summary TEXT,
        request_snapshot_json TEXT
      );
    `
  },
  {
    version: 2,
    sql: `
      CREATE INDEX IF NOT EXISTS idx_saved_requests_collection ON saved_requests(collection_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_history_executed_at ON history(executed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_history_outcome ON history(outcome, executed_at DESC);
    `
  }
] as const;

export class Store {
  readonly db: Database.Database;

  constructor(databasePath = ':memory:') {
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    const applied = new Set((this.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>).map((row) => row.version));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      const apply = this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, new Date().toISOString());
      });
      apply();
    }

    const count = this.db.prepare('SELECT COUNT(*) AS count FROM environments').get() as { count: number };
    if (count.count === 0) {
      const now = new Date().toISOString();
      this.db.prepare('INSERT INTO environments (id, name, is_local, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(createId(), 'Local', now, now);
    }
  }

  listCollections(): Collection[] {
    const collections = this.db.prepare('SELECT * FROM collections ORDER BY name COLLATE NOCASE').all() as CollectionRow[];
    const requestsByCollection = new Map<string, SavedRequest[]>();
    const requests = this.db.prepare('SELECT * FROM saved_requests ORDER BY name COLLATE NOCASE').all() as RequestRow[];
    for (const request of requests) {
      const list = requestsByCollection.get(request.collection_id) ?? [];
      list.push(this.mapRequest(request));
      requestsByCollection.set(request.collection_id, list);
    }
    return collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      createdAt: collection.created_at,
      updatedAt: collection.updated_at,
      requests: requestsByCollection.get(collection.id) ?? []
    }));
  }

  createCollection(name: string): Collection {
    const id = createId();
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, now, now);
    return { id, name, createdAt: now, updatedAt: now, requests: [] };
  }

  renameCollection(id: string, name: string): Collection | null {
    const now = new Date().toISOString();
    const result = this.db.prepare('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
    if (result.changes === 0) return null;
    return this.listCollections().find((collection) => collection.id === id) ?? null;
  }

  deleteCollection(id: string): boolean {
    return this.db.prepare('DELETE FROM collections WHERE id = ?').run(id).changes > 0;
  }

  createRequest(collectionId: string, name: string, definition: RequestDefinition): SavedRequest | null {
    const collection = this.db.prepare('SELECT id FROM collections WHERE id = ?').get(collectionId);
    if (!collection) return null;
    const id = createId();
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db.prepare('INSERT INTO saved_requests (id, collection_id, name, definition_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, collectionId, name, JSON.stringify(definition), now, now);
      this.db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now, collectionId);
    });
    transaction();
    return { id, collectionId, name, definition, createdAt: now, updatedAt: now };
  }

  getRequest(id: string): SavedRequest | null {
    const row = this.db.prepare('SELECT * FROM saved_requests WHERE id = ?').get(id) as RequestRow | undefined;
    return row ? this.mapRequest(row) : null;
  }

  updateRequest(id: string, patch: { name?: string; definition?: RequestDefinition; collectionId?: string }): SavedRequest | null {
    const current = this.getRequest(id);
    if (!current) return null;
    const nextCollectionId = patch.collectionId ?? current.collectionId;
    if (!this.db.prepare('SELECT id FROM collections WHERE id = ?').get(nextCollectionId)) return null;
    const nextName = patch.name ?? current.name;
    const nextDefinition = patch.definition ?? current.definition;
    const nextUpdatedAt = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE saved_requests SET collection_id = ?, name = ?, definition_json = ?, updated_at = ? WHERE id = ?')
        .run(nextCollectionId, nextName, JSON.stringify(nextDefinition), nextUpdatedAt, id);
      this.db.prepare('UPDATE collections SET updated_at = ? WHERE id IN (?, ?)').run(nextUpdatedAt, current.collectionId, nextCollectionId);
    });
    transaction();
    return { ...current, collectionId: nextCollectionId, name: nextName, definition: nextDefinition, updatedAt: nextUpdatedAt };
  }

  duplicateRequest(id: string): SavedRequest | null {
    const current = this.getRequest(id);
    if (!current) return null;
    return this.createRequest(current.collectionId, `${current.name} copy`, current.definition);
  }

  deleteRequest(id: string): boolean {
    const current = this.getRequest(id);
    if (!current) return false;
    const deleted = this.db.prepare('DELETE FROM saved_requests WHERE id = ?').run(id).changes > 0;
    if (deleted) this.db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), current.collectionId);
    return deleted;
  }

  listEnvironments(): Environment[] {
    const environments = this.db.prepare('SELECT * FROM environments ORDER BY is_local DESC, name COLLATE NOCASE').all() as EnvironmentRow[];
    const variables = this.db.prepare('SELECT * FROM environment_variables ORDER BY name COLLATE NOCASE').all() as VariableRow[];
    return environments.map((environment) => ({
      id: environment.id,
      name: environment.name,
      isLocal: Boolean(environment.is_local),
      createdAt: environment.created_at,
      updatedAt: environment.updated_at,
      variables: variables.filter((variable) => variable.environment_id === environment.id).map((variable) => ({
        id: variable.id,
        name: variable.name,
        value: variable.sensitive ? '••••••••' : variable.value,
        sensitive: Boolean(variable.sensitive)
      }))
    }));
  }

  getEnvironmentValues(id: string): Record<string, string> | null {
    if (!this.db.prepare('SELECT id FROM environments WHERE id = ?').get(id)) return null;
    const variables = this.db.prepare('SELECT name, value FROM environment_variables WHERE environment_id = ?').all(id) as Array<{ name: string; value: string }>;
    return Object.fromEntries(variables.map((variable) => [variable.name, variable.value]));
  }

  createEnvironment(name: string, variables: Array<{ name: string; value: string; sensitive: boolean }>): Environment {
    const id = createId();
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db.prepare('INSERT INTO environments (id, name, is_local, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, name, now, now);
      const insert = this.db.prepare('INSERT INTO environment_variables (id, environment_id, name, value, sensitive) VALUES (?, ?, ?, ?, ?)');
      for (const variable of variables) insert.run(createId(), id, variable.name, variable.value, variable.sensitive ? 1 : 0);
    });
    transaction();
    return this.listEnvironments().find((environment) => environment.id === id)!;
  }

  updateEnvironment(id: string, name: string, variables: Array<{ name: string; value: string; sensitive: boolean; id?: string }>): Environment | null {
    const existing = this.db.prepare('SELECT id FROM environments WHERE id = ?').get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE environments SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
      this.db.prepare('DELETE FROM environment_variables WHERE environment_id = ?').run(id);
      const insert = this.db.prepare('INSERT INTO environment_variables (id, environment_id, name, value, sensitive) VALUES (?, ?, ?, ?, ?)');
      for (const variable of variables) insert.run(variable.id ?? createId(), id, variable.name, variable.value, variable.sensitive ? 1 : 0);
    });
    transaction();
    return this.listEnvironments().find((environment) => environment.id === id) ?? null;
  }

  deleteEnvironment(id: string): boolean {
    const environment = this.db.prepare('SELECT is_local FROM environments WHERE id = ?').get(id) as { is_local: number } | undefined;
    if (!environment || environment.is_local) return false;
    return this.db.prepare('DELETE FROM environments WHERE id = ?').run(id).changes > 0;
  }

  addHistory(entry: Omit<HistoryEntry, 'id'>): HistoryEntry {
    const id = createId();
    this.db.prepare(`INSERT INTO history
      (id, request_id, executed_at, method, url, status_code, status_text, duration_ms, response_bytes, outcome, error_summary, request_snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, entry.requestId, entry.executedAt, entry.method, entry.url, entry.statusCode, entry.statusText, entry.durationMs, entry.responseBytes, entry.outcome, entry.errorSummary, entry.requestSnapshot ? JSON.stringify(entry.requestSnapshot) : null);
    this.db.prepare('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY executed_at DESC LIMIT ?)').run(HISTORY_LIMIT);
    return { id, ...entry };
  }

  listHistory(): HistoryEntry[] {
    const rows = this.db.prepare('SELECT * FROM history ORDER BY executed_at DESC LIMIT ?').all(HISTORY_LIMIT) as HistoryRow[];
    return rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      executedAt: row.executed_at,
      method: row.method as HistoryEntry['method'],
      url: row.url,
      statusCode: row.status_code,
      statusText: row.status_text,
      durationMs: row.duration_ms,
      responseBytes: row.response_bytes,
      outcome: row.outcome as HistoryEntry['outcome'],
      errorSummary: row.error_summary,
      requestSnapshot: this.parseSnapshot(row.request_snapshot_json)
    }));
  }

  getHistory(id: string): HistoryEntry | null {
    return this.listHistory().find((entry) => entry.id === id) ?? null;
  }

  clearHistory(): void {
    this.db.prepare('DELETE FROM history').run();
  }

  exportBundle(includeSecrets = false): ExportBundle {
    const collections = this.listCollections().map((collection) => ({
      name: collection.name,
      requests: collection.requests.map((request) => ({
        name: request.name,
        definition: includeSecrets ? request.definition : sanitizeRequestForHistory(request.definition)
      }))
    }));
    const environmentsRows = this.db.prepare('SELECT * FROM environments WHERE is_local = 0 ORDER BY name COLLATE NOCASE').all() as EnvironmentRow[];
    const variables = this.db.prepare('SELECT * FROM environment_variables ORDER BY name COLLATE NOCASE').all() as VariableRow[];
    const environments = environmentsRows.map((environment) => ({
      name: environment.name,
      variables: variables.filter((variable) => variable.environment_id === environment.id).map((variable) => ({
        name: variable.name,
        value: variable.sensitive && !includeSecrets ? null : variable.value,
        sensitive: Boolean(variable.sensitive)
      }))
    }));
    return {
      format: 'tracelab',
      version: 1,
      exportedAt: new Date().toISOString(),
      includesSecrets: includeSecrets,
      collections,
      environments
    };
  }

  importBundle(bundle: ExportBundle): { collectionsCreated: number; requestsCreated: number; environmentsCreated: number; secretValuesOmitted: number } {
    const parsed = ExportBundleSchema.parse(bundle);
    let collectionsCreated = 0;
    let requestsCreated = 0;
    let environmentsCreated = 0;
    let secretValuesOmitted = 0;
    const transaction = this.db.transaction(() => {
      for (const collection of parsed.collections) {
        const created = this.createCollection(collection.name);
        collectionsCreated += 1;
        for (const request of collection.requests) {
          if (this.createRequest(created.id, request.name, request.definition)) requestsCreated += 1;
        }
      }
      for (const environment of parsed.environments) {
        let name = environment.name;
        let suffix = 2;
        while (this.db.prepare('SELECT id FROM environments WHERE name = ?').get(name)) {
          name = `${environment.name} (imported${suffix > 2 ? ` ${suffix}` : ''})`;
          suffix += 1;
        }
        const values = environment.variables.map((variable) => {
          if (variable.sensitive && variable.value === null) secretValuesOmitted += 1;
          return { name: variable.name, value: variable.value ?? '', sensitive: variable.sensitive };
        });
        this.createEnvironment(name, values);
        environmentsCreated += 1;
      }
    });
    transaction();
    return { collectionsCreated, requestsCreated, environmentsCreated, secretValuesOmitted };
  }

  private mapRequest(row: RequestRow): SavedRequest {
    const parsed = RequestDefinitionSchema.safeParse(JSON.parse(row.definition_json));
    if (!parsed.success) throw new Error(`Saved request ${row.id} contains an invalid definition.`);
    return {
      id: row.id,
      collectionId: row.collection_id,
      name: row.name,
      definition: parsed.data,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private parseSnapshot(value: string | null): RequestDefinition | null {
    if (!value) return null;
    try {
      const parsed = RequestDefinitionSchema.safeParse(JSON.parse(value));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
