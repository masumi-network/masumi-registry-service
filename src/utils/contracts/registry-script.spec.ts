import { Network } from '@prisma/client';
import { getRegistryScriptV2 } from './registry-script';
import { DEFAULTS } from '@/utils/config';

describe('getRegistryScriptV2', () => {
  it('derives the pinned V2 registry policyId, identical on both networks', () => {
    const preprod = getRegistryScriptV2(Network.Preprod);
    const mainnet = getRegistryScriptV2(Network.Mainnet);

    expect(preprod.policyId).toBe(
      '7890b485b808043ef80136a447a3a43c18893a309dc323d1f8b0a13d'
    );
    expect(mainnet.policyId).toBe(preprod.policyId);
    expect(preprod.policyId).toBe(DEFAULTS.REGISTRY_POLICY_ID_PREPROD_V2);
    expect(mainnet.policyId).toBe(DEFAULTS.REGISTRY_POLICY_ID_MAINNET_V2);
  });

  it('derives network-specific script addresses', () => {
    expect(getRegistryScriptV2(Network.Preprod).smartContractAddress).toMatch(
      /^addr_test1/
    );
    expect(getRegistryScriptV2(Network.Mainnet).smartContractAddress).toMatch(
      /^addr1/
    );
  });
});
