import { buildApp } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { startScheduledJobs, stopScheduledJobs } from './jobs';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    stopScheduledJobs();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled promise rejection');
  });

  try {
    await app.listen({ host: config.host, port: config.port });
    await startScheduledJobs(app);
    app.log.info(
      {
        env: config.env,
        docs: config.isProduction ? null : `${config.publicBaseUrl}/docs`,
        priceProvider: config.priceProvider,
      },
      'Investment platform API is running',
    );
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start server');
    await prisma.$disconnect();
    process.exit(1);
  }
}

void main();
