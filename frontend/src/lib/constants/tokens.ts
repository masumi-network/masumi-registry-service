/** Stablecoin / known-asset ids — mirrored from payment-service for display parity. */

export const USDM_CONFIG = {
  policyId: 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad',
  assetName: '0014df105553444d',
  fullAssetId: 'c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d',
};

export const PREPROD_USDM_CONFIG = {
  policyId: '16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde',
  assetName: '0014df10745553444d',
  fullAssetId: '16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde0014df10745553444d',
};

export const TESTUSDM_CONFIG = {
  unit: '16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde0014df10745553444d',
};

export const USDCX_CONFIG = {
  policyId: '1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34',
  assetName: '5553444378',
  fullAssetId: '1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e345553444378',
};

export const getUsdmConfig = (network: string) => {
  return network?.toLowerCase() === 'preprod' ? PREPROD_USDM_CONFIG : USDM_CONFIG;
};
