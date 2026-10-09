jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn() }));
jest.mock('pg', () => ({ __esModule: true, default: { Pool: jest.fn() } }));

import pg from 'pg';

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
});

function loadDb(env: Record<string, string>) {
  process.env = { DATABASE_URL: 'postgresql://test', ...env };
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./index');
  });
}

describe('database pool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is built from the validated configuration', () => {
    loadDb({
      DB_CONNECTION_POOL_LIMIT: '8',
      DB_STAEMENT_TIMEOUT: '30000',
      DB_CONNECTION_TIMEOUT: '15',
      DB_POOL_TIMEOUT: '40',
    });

    expect(pg.Pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://test',
      max: 8,
      statement_timeout: 30000,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 40000,
    });
  });

  it('is never constructed from invalid settings', () => {
    expect(() => loadDb({ DB_CONNECTION_POOL_LIMIT: 'garbage' })).toThrow(
      /DB_CONNECTION_POOL_LIMIT/
    );
    expect(() => loadDb({ DB_STAEMENT_TIMEOUT: 'Infinity' })).toThrow(
      /DB_STAEMENT_TIMEOUT/
    );
    expect(pg.Pool).not.toHaveBeenCalled();
  });
});
