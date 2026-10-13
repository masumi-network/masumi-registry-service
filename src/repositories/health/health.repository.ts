import { CONFIG } from '@/utils/config';

function getHealthConfiguration() {
  return { type: 'masumi-registry', version: CONFIG.VERSION };
}

export const healthRepository = { getHealthConfiguration };
