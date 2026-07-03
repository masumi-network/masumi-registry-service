import {
  getAgentVersion,
  getAgentVersionRoot,
  getPolicyId,
  isV2Policy,
} from './index';
import { DEFAULTS } from '@/utils/config';

const V2_POLICY = DEFAULTS.REGISTRY_POLICY_ID_PREPROD_V2;
const V1_POLICY = DEFAULTS.REGISTRY_POLICY_ID_PREPROD;

// A V2 asset name is nonce(1B) ++ root_hash(28B) ++ version(3B).
const NONCE = 'cd';
const ROOT_HASH = 'ab'.repeat(28); // 28 bytes
const v2Asset = (versionHex: string) =>
  `${V2_POLICY}${NONCE}${ROOT_HASH}${versionHex}`;

describe('agent-version helpers', () => {
  it('recognizes the V2 policy on both networks and rejects others', () => {
    expect(isV2Policy(V2_POLICY)).toBe(true);
    expect(isV2Policy(DEFAULTS.REGISTRY_POLICY_ID_MAINNET_V2)).toBe(true);
    expect(isV2Policy(V1_POLICY)).toBe(false);
    expect(isV2Policy(null)).toBe(false);
    expect(isV2Policy(undefined)).toBe(false);
  });

  it('extracts the leading 28-byte policy id', () => {
    expect(getPolicyId(v2Asset('000001'))).toBe(V2_POLICY);
    expect(getPolicyId(v2Asset('000001'))).toHaveLength(56);
  });

  it('derives the version-independent root by dropping the 3-byte postfix', () => {
    const root = `${V2_POLICY}${NONCE}${ROOT_HASH}`;
    expect(getAgentVersionRoot(v2Asset('000001'))).toBe(root);
    // Every version of the same agent shares the root exactly.
    expect(getAgentVersionRoot(v2Asset('00000a'))).toBe(root);
  });

  it('decodes the big-endian version postfix', () => {
    expect(getAgentVersion(v2Asset('000000'))).toBe(0);
    expect(getAgentVersion(v2Asset('000001'))).toBe(1);
    expect(getAgentVersion(v2Asset('00000a'))).toBe(10);
    expect(getAgentVersion(v2Asset('ffffff'))).toBe(16777215);
  });
});
