import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';
import { createApp } from '../src/create-app';

/**
 * Vercel serverless entry point for the NestJS API.
 *
 * HOW IT WORKS
 * ------------
 * Vercel runs this file as a serverless function. On the first request (a
 * "cold start") we bootstrap the full Nest application once and grab the
 * underlying Express instance. We cache it on a module-level promise so that
 * every subsequent request handled by the SAME warm function instance reuses
 * the already-initialised app instead of booting Nest again.
 *
 * We intentionally use app.init() (NOT app.listen()) — Vercel owns the HTTP
 * server/port; we only need Nest wired up so we can hand it the raw
 * (req, res) that Vercel gives us. The Express instance is a valid
 * (req, res) => void handler.
 *
 * MIGRATIONS
 * ----------
 * This handler does NOT run database migrations. There is no persistent boot
 * on serverless, so migrations run once in the Vercel BUILD step
 * (`prisma migrate deploy`) — see DEPLOYMENT-VERCEL.md. That is why we set
 * RUN_MIGRATIONS_ON_BOOT here defensively: even if any boot-time migration
 * code were reached, it would be skipped in the serverless runtime.
 */

// Ensure nothing tries to run migrations from within the serverless runtime.
process.env.RUN_MIGRATIONS_ON_BOOT = 'false';

let cachedServer: Promise<Express> | null = null;

async function bootstrapServer(): Promise<Express> {
  const app = await createApp();
  // Initialise all modules/providers WITHOUT binding to a port.
  await app.init();
  // The Express instance itself is the (req, res) request handler.
  return app.getHttpAdapter().getInstance() as Express;
}

function getServer(): Promise<Express> {
  if (!cachedServer) {
    cachedServer = bootstrapServer();
  }
  return cachedServer;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const server = await getServer();
  server(req as never, res as never);
}
