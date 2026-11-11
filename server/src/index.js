import { createApp } from './app.js';
import { connect, disconnect } from './db.js';

const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  try {
    await connect();
  } catch (error) {
    console.error('[specdrift] could not reach MongoDB:', error.message);
    console.error('[specdrift] set MONGODB_URI, or start one with: docker compose up -d mongo');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[specdrift] API listening on http://localhost:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`[specdrift] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
