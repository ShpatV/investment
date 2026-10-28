import { PrismaClient } from '@prisma/client';
import { config } from '../config';

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  log: config.env === 'development' ? ['warn', 'error'] : ['error'],
});

export type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
