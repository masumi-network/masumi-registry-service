import type { Network } from './agent-filters';

// The registry-source endpoint stores whatever it is sent: no policy id check, and a second
// source for the same network and policy fails as a database error. The form checks both
// first. A policy id is 28 bytes, written as 56 hex characters.
const POLICY_ID = /^[0-9a-f]{56}$/i;

export interface SourceDraft {
  policyId: string;
  network: Network;
  rpcProviderApiKey: string;
  note: string;
}

export type SourceErrors = Partial<Record<keyof SourceDraft, string>>;

export function validateNewSource(
  draft: SourceDraft,
  existing: readonly { policyId: string | null; network: Network | null }[],
): SourceErrors {
  const errors: SourceErrors = {};
  const policyId = draft.policyId.trim().toLowerCase();
  if (!POLICY_ID.test(policyId)) {
    errors.policyId = 'A policy ID is 56 hexadecimal characters.';
  } else if (
    existing.some(
      (source) => source.network === draft.network && source.policyId?.toLowerCase() === policyId,
    )
  ) {
    errors.policyId = `This policy is already a source on ${draft.network}.`;
  }
  if (!draft.rpcProviderApiKey.trim()) {
    errors.rpcProviderApiKey = 'The registry needs a Blockfrost project key to scan the chain.';
  }
  return errors;
}

/** A provider key as "••••1234": admins can tell keys apart without exposing them. */
export function maskSecret(secret: string | null): string {
  if (!secret) return '—';
  return secret.length > 4 ? `••••${secret.slice(-4)}` : '••••';
}
