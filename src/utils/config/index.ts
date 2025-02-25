import * as dotenv from 'dotenv';
dotenv.config();

if (process.env.DATABASE_URL == null)
  throw new Error('Undefined DATABASE_URL ENV variables');

const updateCardanoRegistryInterval = Number(
  process.env.UPDATE_CARDANO_REGISTRY_INTERVAL ?? '50'
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
  VERSION: '0.1.2',
};

export const DEFAULTS = {
  REGISTRY_POLICY_ID_Preprod:
    '0520e542b4704586b7899e8af207501fd1cfb4d12fc419ede7986de8',
  REGISTRY_POLICY_ID_Mainnet:
    'ec878babd6cbd840ae7745a74356b271a24a4391fd6a27e855572fc4',
};
