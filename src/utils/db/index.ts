import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { CONFIG } from '../config';
import { logger } from '../logger';

// Pool settings come from the validated CONFIG, never from raw env vars.
const buildPoolConfig = (): pg.PoolConfig => ({
  connectionString: CONFIG.DATABASE_URL,
  max: CONFIG.DB_CONNECTION_POOL_LIMIT,
  statement_timeout: CONFIG.DB_STAEMENT_TIMEOUT,
  connectionTimeoutMillis: CONFIG.DB_CONNECTION_TIMEOUT * 1000,
  idleTimeoutMillis: CONFIG.DB_POOL_TIMEOUT * 1000,
});

const pool = new pg.Pool(buildPoolConfig());
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function cleanupDB() {
  await prisma.$disconnect();
  await pool.end();
}

export async function initDB() {
  await prisma.$connect();
  logger.info('Initialized database');
}
