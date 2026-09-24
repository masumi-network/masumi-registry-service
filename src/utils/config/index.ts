import * as dotenv from 'dotenv';
import { parseCorsAllowedOrigins } from '@/utils/http-security';

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
const updatePurchaseIndexInterval = Number(
  process.env.UPDATE_PURCHASE_INDEX_INTERVAL ?? '300'
);
if (!(updatePurchaseIndexInterval >= 60))
  throw new Error('Invalid UPDATE_PURCHASE_INDEX_INTERVAL ENV variables');

// Weights of the ranking score. Successful purchases dominate: they are the
// only input that costs an attacker real on-chain transactions (thesis §4.1).
const rankingWeights = {
  successfulPurchases: Number(
    process.env.RANKING_WEIGHT_SUCCESSFUL_PURCHASES ?? '0.6'
  ),
  uptime: Number(process.env.RANKING_WEIGHT_UPTIME ?? '0.3'),
  lineageAge: Number(process.env.RANKING_WEIGHT_LINEAGE_AGE ?? '0.1'),
};
const rankingWeightValues = Object.values(rankingWeights);
if (
  rankingWeightValues.some((weight) => !(weight >= 0)) ||
  rankingWeightValues.reduce((sum, weight) => sum + weight, 0) <= 0
)
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
