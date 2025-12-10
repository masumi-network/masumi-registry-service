import * as dotenv from 'dotenv';
dotenv.config();

if (process.env.DATABASE_URL == null)
  throw new Error('Undefined DATABASE_URL ENV variables');

const updateCardanoRegistryInterval = Number(
  process.env.UPDATE_CARDANO_REGISTRY_INTERVAL ?? '50'
);
const updateHealthCheckInterval = Number(
  process.env.UPDATE_HEALTH_CHECK_INTERVAL ?? '100'
);
if (updateCardanoRegistryInterval < 20)
  throw new Error('Invalid UPDATE_CARDANO_REGISTRY_INTERVAL ENV variables');

const dbConnectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT ?? '20');
if (dbConnectionTimeout < 5)
  throw new Error('Invalid DB_CONNECTION_TIMEOUT ENV variables');
const dbConnectionPoolLimit = Number(
  process.env.DB_CONNECTION_POOL_LIMIT ?? '5'
);
if (dbConnectionPoolLimit < 1)
  throw new Error('Invalid DB_CONNECTION_POOL_LIMIT ENV variables');
const dbStatementTimeout = Number(process.env.DB_STAEMENT_TIMEOUT ?? '25000');
if (dbStatementTimeout < 10000)
  throw new Error('Invalid DB_STAEMENT_TIMEOUT ENV variables');
const dbPoolTimeout = Number(process.env.DB_POOL_TIMEOUT ?? '25');
if (dbPoolTimeout < 5) throw new Error('Invalid DB_POOL_TIMEOUT ENV variables');

export const CONFIG = {
  PORT: process.env.PORT ?? '3000',
  DATABASE_URL: process.env.DATABASE_URL,
  UPDATE_CARDANO_REGISTRY_INTERVAL: updateCardanoRegistryInterval,
  UPDATE_HEALTH_CHECK_INTERVAL: updateHealthCheckInterval,
  VERSION: '0.1.2',
  DB_CONNECTION_TIMEOUT: dbConnectionTimeout,
  DB_CONNECTION_POOL_LIMIT: dbConnectionPoolLimit,
  DB_STAEMENT_TIMEOUT: dbStatementTimeout,
  DB_POOL_TIMEOUT: dbPoolTimeout,
};

export const DEFAULTS = {
  REGISTRY_POLICY_ID_PREPROD:
    '7e8bdaf2b2b919a3a4b94002cafb50086c0c845fe535d07a77ab7f77',
  REGISTRY_POLICY_ID_MAINNET:
    'ad6424e3ce9e47bbd8364984bd731b41de591f1d11f6d7d43d0da9b9',
  METADATA_VERSION: 1,
};
