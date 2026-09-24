import * as dotenv from 'dotenv';
import { parseCorsAllowedOrigins } from '@/utils/http-security';

dotenv.config();

if (process.env.DATABASE_URL == null)
  throw new Error('Undefined DATABASE_URL ENV variables');

// Node timers silently fire after 1ms for delays above 2^31-1 ms, so every
// value that ends up in a timer is capped there.
const MAX_TIMER_MS = 2147483647;
const MAX_TIMER_SECONDS = Math.floor(MAX_TIMER_MS / 1000);

// Reads a numeric env var, falling back to `fallback` only when it is unset.
// Rejects NaN, Infinity, empty strings and out-of-range values at startup,
// naming the variable.
function readNumberEnv(
  name: string,
  fallback: number,
  bounds: { min: number; max: number; integer?: boolean }
): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw.trim() || NaN);
  if (
    !Number.isFinite(value) ||
    value < bounds.min ||
    value > bounds.max ||
    (bounds.integer === true && !Number.isInteger(value))
  ) {
    throw new Error(
      `Invalid ${name} ENV variable: expected ${bounds.integer === true ? 'an integer' : 'a number'} between ${bounds.min} and ${bounds.max}, got "${raw}"`
    );
  }
  return value;
}

const updateCardanoRegistryInterval = readNumberEnv(
  'UPDATE_CARDANO_REGISTRY_INTERVAL',
  50,
  { min: 20, max: MAX_TIMER_SECONDS }
);
const updateHealthCheckInterval = readNumberEnv(
  'UPDATE_HEALTH_CHECK_INTERVAL',
  100,
  { min: 20, max: MAX_TIMER_SECONDS }
);
const dbConnectionTimeout = readNumberEnv('DB_CONNECTION_TIMEOUT', 20, {
  min: 5,
  max: MAX_TIMER_SECONDS,
});
const dbConnectionPoolLimit = readNumberEnv('DB_CONNECTION_POOL_LIMIT', 5, {
  min: 1,
  max: Number.MAX_SAFE_INTEGER,
  integer: true,
});
const dbStatementTimeout = readNumberEnv('DB_STAEMENT_TIMEOUT', 25000, {
  min: 10000,
  max: MAX_TIMER_MS,
});
const dbPoolTimeout = readNumberEnv('DB_POOL_TIMEOUT', 25, {
  min: 5,
  max: MAX_TIMER_SECONDS,
});
const corsAllowedOrigins = parseCorsAllowedOrigins(
  process.env.CORS_ALLOWED_ORIGINS
);

export const CONFIG = {
  PORT: process.env.PORT ?? '3000',
  DATABASE_URL: process.env.DATABASE_URL,
  CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
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
  // V2 registry minting policy. The V2 registry validator is unparameterized, so
  // the policy hash is identical on both networks. Derived via getRegistryScriptV2
  // (mesh 1.9.0) and asserted in registry-script.spec.ts. Bumped from
  // 7890b485... when the V2 contract was recompiled with Aiken v1.1.23 (see
  // masumi-payment-service docs/migrations/v2-contract-cip30-upgrade.md).
  REGISTRY_POLICY_ID_PREPROD_V2:
    '67ab0c92c4ac1610895a1c965ee50aba41a8f1513b15240723b3bd0b',
  REGISTRY_POLICY_ID_MAINNET_V2:
    '67ab0c92c4ac1610895a1c965ee50aba41a8f1513b15240723b3bd0b',
  METADATA_VERSION: 1,
  METADATA_VERSION_V2: 2,
};
