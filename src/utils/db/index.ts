import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { logger } from '../logger';

const buildPoolConfig = (): pg.PoolConfig => {
  const connectionString = process.env.DATABASE_URL!;
  const dbConnectionTimeoutSec = Number(
    process.env.DB_CONNECTION_TIMEOUT ?? '20'
  );
  const dbConnectionPoolLimit = Number(
    process.env.DB_CONNECTION_POOL_LIMIT ?? '5'
  );
  const dbStatementTimeoutMs = Number(
    process.env.DB_STAEMENT_TIMEOUT ?? '25000'
  );
  const dbPoolTimeoutSec = Number(process.env.DB_POOL_TIMEOUT ?? '25');

  return {
    connectionString,
    max: dbConnectionPoolLimit,
    statement_timeout: dbStatementTimeoutMs,
    connectionTimeoutMillis: dbConnectionTimeoutSec * 1000,
    idleTimeoutMillis: dbPoolTimeoutSec * 1000,
  };
};

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
