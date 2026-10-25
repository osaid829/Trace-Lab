import path from 'node:path';

export type ServerConfig = {
  host: string;
  port: number;
  databasePath: string;
  allowPrivateTargets: boolean;
  maxResponseBytes: number;
  maxRequestBytes: number;
  maxRedirects: number;
  webOrigin: string;
};

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = numberFromEnv(name, fallback);
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const config: ServerConfig = {
    host: process.env.TRACELAB_HOST ?? '127.0.0.1',
    port: boundedNumber('TRACELAB_PORT', 4310, 1, 65_535),
    databasePath: path.resolve(process.env.TRACELAB_DATABASE_PATH ?? './.data/tracelab.sqlite'),
    allowPrivateTargets: process.env.TRACELAB_ALLOW_PRIVATE_TARGETS === 'true',
    maxResponseBytes: boundedNumber('TRACELAB_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, 1_024, 50 * 1024 * 1024),
    maxRequestBytes: boundedNumber('TRACELAB_MAX_REQUEST_BYTES', 1024 * 1024, 1_024, 10 * 1024 * 1024),
    maxRedirects: boundedNumber('TRACELAB_MAX_REDIRECTS', 5, 0, 10),
    webOrigin: process.env.TRACELAB_WEB_ORIGIN ?? 'http://localhost:5173',
    ...overrides
  };
  if (config.host !== '127.0.0.1' && config.host !== 'localhost' && config.host !== '::1') {
    throw new Error('TraceLab must bind to loopback by default. Set an explicit deployment configuration before using another host.');
  }
  return config;
}
