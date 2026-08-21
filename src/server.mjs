import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequestHandler } from './app/create-app.mjs';
import { InMemoryRateLimiter } from './app/rate-limiter.mjs';
import { createServices } from './runtime/services.mjs';

function parsePositiveInteger(value, fallback, name) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
}

export function startServer({
  services,
  publicDir = null,
  port = 3000,
  host = '0.0.0.0',
  rateLimiter = null,
}) {
  const server = createServer(createRequestHandler({ services, publicDir, rateLimiter }));
  server.listen(port, host);
  return server;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const services = createServices(process.env);
    const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
    const port = parsePositiveInteger(process.env.PORT, 3000, 'PORT');
    const rateLimiter = new InMemoryRateLimiter({
      limit: parsePositiveInteger(
        process.env.RATE_LIMIT_REQUESTS,
        10,
        'RATE_LIMIT_REQUESTS',
      ),
      windowMs: parsePositiveInteger(
        process.env.RATE_LIMIT_WINDOW_MS,
        60_000,
        'RATE_LIMIT_WINDOW_MS',
      ),
    });
    const server = startServer({ services, publicDir, port, rateLimiter });
    server.on('listening', () => {
      console.log(`Research Frontier Radar listening on http://localhost:${port} in ${services.mode} mode.`);
    });
    server.on('error', (error) => {
      console.error(`Server failed: ${error.name}`);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
