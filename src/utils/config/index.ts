import * as dotenv from 'dotenv';
import { parseCorsAllowedOrigins } from '@/utils/http-security';

dotenv.config();

if (process.env.DATABASE_URL == null)
  throw new Error('Undefined DATABASE_URL ENV variables');

// Node timers silently fire after 1ms for delays above 2^31-1 ms, so every
// value that ends up in a timer is capped there.
const MAX_TIMER_MS = 2147483647;
const MAX_TIMER_SECONDS = Math.floor(MAX_TIMER_MS / 1000);

// Plain decimal only: Number() alone would also accept hex ("0x20"),
// binary, octal and exponent ("1e2") notation.
const DECIMAL_NUMBER = /^\d+(\.\d+)?$/;

// Reads a numeric env var, falling back to `fallback` only when it is unset.
// Rejects non-decimal input, empty strings and out-of-range values at
// startup, naming the variable.
function readNumberEnv(
  name: string,
  fallback: number,
  bounds: { min: number; max: number; integer?: boolean }
): number {
  const raw = process.env[name];
  const trimmed = raw?.trim() ?? '';
  const value =
    raw === undefined
      ? fallback
      : DECIMAL_NUMBER.test(trimmed)
        ? Number(trimmed)
        : NaN;
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
const updatePurchaseIndexInterval = readNumberEnv(
  'UPDATE_PURCHASE_INDEX_INTERVAL',
  300,
  { min: 60, max: MAX_TIMER_SECONDS }
);
// Every probe is a request to a third party's server, so this runs far less
// often than the health check.
const updateX402ProbeInterval = readNumberEnv(
  'UPDATE_X402_PROBE_INTERVAL',
  3600,
  { min: 300, max: MAX_TIMER_SECONDS }
);

// Weights of the ranking score. Distinct buyers dominate: they are the only
// input that costs an attacker real on-chain transactions (thesis §4.1).
const RANKING_WEIGHT_BOUNDS = { min: 0, max: Number.MAX_SAFE_INTEGER };
const rankingWeights = {
  distinctBuyers: readNumberEnv(
    'RANKING_WEIGHT_DISTINCT_BUYERS',
    0.6,
    RANKING_WEIGHT_BOUNDS
  ),
  uptime: readNumberEnv('RANKING_WEIGHT_UPTIME', 0.3, RANKING_WEIGHT_BOUNDS),
  lineageAge: readNumberEnv(
    'RANKING_WEIGHT_LINEAGE_AGE',
    0.1,
    RANKING_WEIGHT_BOUNDS
  ),
};
if (Object.values(rankingWeights).reduce((sum, weight) => sum + weight, 0) <= 0)
  throw new Error('Invalid RANKING_WEIGHT_* ENV variables');

const corsAllowedOrigins = parseCorsAllowedOrigins(
  process.env.CORS_ALLOWED_ORIGINS
);

export const CONFIG = {
  PORT: process.env.PORT ?? '3000',
  DATABASE_URL: process.env.DATABASE_URL,
  CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
  UPDATE_CARDANO_REGISTRY_INTERVAL: updateCardanoRegistryInterval,
  UPDATE_HEALTH_CHECK_INTERVAL: updateHealthCheckInterval,
  UPDATE_PURCHASE_INDEX_INTERVAL: updatePurchaseIndexInterval,
  UPDATE_X402_PROBE_INTERVAL: updateX402ProbeInterval,
  RANKING_WEIGHTS: rankingWeights,
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
  // Default masumi payment escrow contracts (V1 and V2), mirrored from
  // masumi-payment-service packages/payment-core/src/config.ts. Their
  // withdrawals are indexed as successful purchases for ranking.
  PAYMENT_CONTRACT_ADDRESSES_PREPROD: [
    'addr_test1wz7j4kmg2cs7yf92uat3ed4a3u97kr7axxr4avaz0lhwdsqukgwfm',
    'addr_test1wzs4e6wc95hkwezlccjw9mdvq0r0rsgx6zk34avptga3ftgn37w4g',
  ],
  PAYMENT_CONTRACT_ADDRESSES_MAINNET: [
    'addr1wx7j4kmg2cs7yf92uat3ed4a3u97kr7axxr4avaz0lhwdsq87ujx7',
    'addr1wxs4e6wc95hkwezlccjw9mdvq0r0rsgx6zk34avptga3ftgge2j6d',
  ],
};
