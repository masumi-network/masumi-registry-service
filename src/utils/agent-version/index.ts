import { DEFAULTS } from '@/utils/config';

// A V2 registry asset name is `nonce(1B) ++ root_hash(28B) ++ version(3B)` (see
// src/utils/contracts/registry-v2/README.md). An update burns the old asset and
// mints a replacement with the SAME nonce++root_hash and the version bumped by
// one, so nonce++root_hash is the stable, version-independent agent identity and
// only the 3-byte version postfix changes across versions.
export const V2_VERSION_POSTFIX_HEX_LENGTH = 6; // 3 bytes, 2 hex chars each

// Length of a Cardano policy id in hex chars (28 bytes). The policy id is the
// leading segment of every assetIdentifier (policyId ++ assetName).
const POLICY_ID_HEX_LENGTH = 56;

// The version postfix scheme only applies to assets minted by the V2 registry
// policy. The V2 validator is unparameterized, so the policy hash is identical
// on Preprod and Mainnet.
export function isV2Policy(policyId: string | null | undefined): boolean {
  return (
    policyId === DEFAULTS.REGISTRY_POLICY_ID_PREPROD_V2 ||
    policyId === DEFAULTS.REGISTRY_POLICY_ID_MAINNET_V2
  );
}

// The policy id embedded at the front of an assetIdentifier.
export function getPolicyId(assetIdentifier: string): string {
  return assetIdentifier.slice(0, POLICY_ID_HEX_LENGTH);
}

// The version-independent identity shared by every version of a V2 agent: the
// full assetIdentifier minus its 3-byte version postfix. Every stored version of
// the same agent shares this as an exact prefix.
export function getAgentVersionRoot(assetIdentifier: string): string {
  return assetIdentifier.slice(0, -V2_VERSION_POSTFIX_HEX_LENGTH);
}

// The numeric version encoded in the 3-byte (big-endian) postfix.
export function getAgentVersion(assetIdentifier: string): number {
  return parseInt(assetIdentifier.slice(-V2_VERSION_POSTFIX_HEX_LENGTH), 16);
}
