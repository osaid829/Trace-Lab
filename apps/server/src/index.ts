import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`TraceLab local service listening on http://${config.host}:${config.port}`);
  const shutdown = async (signal: string) => {
    app.log.info(`TraceLab local service stopping (${signal})`);
    await app.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
} catch (error) {
  app.log.error('TraceLab local service failed to start');
  process.exitCode = 1;
}
