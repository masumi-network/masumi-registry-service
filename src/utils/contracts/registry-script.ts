import { type PlutusScript } from '@meshsdk/core';
import {
  deserializePlutusScript,
  normalizePlutusScript,
  resolvePlutusScriptAddress,
} from '@meshsdk/core-cst';
import { Network } from '@prisma/client';
// Plain JSON import (resolveJsonModule). No `with { type: 'json' }` attribute:
// module=ES2022 rejects it, and the toolchains here (tsx, pkgroll, ts-jest/babel)
// bundle/require the JSON rather than doing a raw-node ESM JSON import.
import registryPlutusV2 from './registry-v2/plutus.json';

// Cardano network id used by the address serializer: Mainnet = 1, testnets = 0.
function convertNetworkToId(network: Network): number {
  return network === Network.Mainnet ? 1 : 0;
}

/**
 * Derives the V2 registry minting policy from the compiled `registry-v2`
 * validator (synced from masumi-payment-service). The validator takes no
 * parameters, so the `policyId` is deterministic and identical on both networks;
 * only the script address differs by network prefix.
 *
 * Mirrors `getRegistryScriptV2` in masumi-payment-service
 * (packages/payment-source-v2). The correct policy hash REQUIRES the V2 mesh line
 * (`@meshsdk/core(-cst)@1.9.0` — this repo's current pin); a different
 * mesh version would derive a different hash. See ADR-0005 in the payment service.
 */
export function getRegistryScriptV2(network: Network): {
  policyId: string;
  smartContractAddress: string;
} {
  const script: PlutusScript = {
    // Aiken emits SingleCBOR but mesh/ledger consumers expect DoubleCBOR (see
    // registry-v2/mint-example.mjs). The validator takes zero params, so the
    // second CBOR wrap that `applyParamsToScript` would add must be applied here.
    code: normalizePlutusScript(
      registryPlutusV2.validators[0].compiledCode,
      'DoubleCBOR'
    ),
    version: 'V3',
  };

  const policyId = String(
    deserializePlutusScript(script.code, script.version).hash()
  );
  const smartContractAddress = String(
    resolvePlutusScriptAddress(script, convertNetworkToId(network))
  );

  return { policyId, smartContractAddress };
}
