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

const updateCardanoDeregisterInterval = Number(
  process.env.UPDATE_CARDANO_DEREGISTER_INTERVAL ?? '120'
);
if (updateCardanoDeregisterInterval < 20)
  throw new Error('Invalid UPDATE_CARDANO_DEREGISTER_INTERVAL ENV variables');

export const CONFIG = {
  PORT: process.env.PORT ?? '3000',
  DATABASE_URL: process.env.DATABASE_URL,
  UPDATE_CARDANO_REGISTRY_INTERVAL: updateCardanoRegistryInterval,
  UPDATE_CARDANO_DEREGISTER_INTERVAL: updateCardanoDeregisterInterval,
  UPDATE_HEALTH_CHECK_INTERVAL: updateHealthCheckInterval,
  VERSION: '0.1.2',
};

export const DEFAULTS = {
  REGISTRY_POLICY_ID_PREPROD:
    '0c2912d4088fbc6a0c725dbe5233735821109bd741acfa9f13902302',
  REGISTRY_POLICY_ID_MAINNET:
    '01cca9f42943e3a8342dfa501f9360e3afba9bcd04c7655aa7577de1',
  METADATA_VERSION: 1,
};
