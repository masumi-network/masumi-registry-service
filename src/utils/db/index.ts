import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

// Add timeout parameters to DATABASE_URL if not already present
const getDatabaseUrlWithTimeouts = () => {
  const baseUrl = process.env.DATABASE_URL!;
  const url = new URL(baseUrl);
  const dbConnectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT ?? '20');
  const dbConnectionPoolLimit = Number(
    process.env.DB_CONNECTION_POOL_LIMIT ?? '5'
  );
  const dbStatementTimeout = Number(process.env.DB_STAEMENT_TIMEOUT ?? '25000');
  const dbPoolTimeout = Number(process.env.DB_POOL_TIMEOUT ?? '25');

  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', dbConnectionPoolLimit.toString());
  }
  if (!url.searchParams.has('statement_timeout')) {
    url.searchParams.set('statement_timeout', dbStatementTimeout.toString());
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', dbPoolTimeout.toString());
  }
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', dbConnectionTimeout.toString());
  }

  return url.toString();
};

export const prisma = new PrismaClient({
  //log: ["query", "info", "warn", "error"]
  datasources: {
    db: {
      url: getDatabaseUrlWithTimeouts(),
    },
  },
});

export async function cleanupDB() {
  await prisma.$disconnect();
}

export async function initDB() {
  await prisma.$connect();
  logger.info('Initialized database');
}
