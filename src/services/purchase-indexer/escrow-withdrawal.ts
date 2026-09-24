// Pure decoding helpers for masumi payment escrow withdrawals. Layouts mirror
// masumi-payment-service smart-contracts/payment{,-v2}/validators/vested_pay.ak.

// Withdraw is redeemer constructor 0 in both contract versions: the seller
// collects the escrow after delivering, i.e. a successful purchase.
export const WITHDRAW_REDEEMER_CONSTRUCTOR = 0;

const V1_DATUM_FIELD_COUNT = 16;
const V1_SELLER_NONCE_FIELD = 4;
const V2_DATUM_FIELD_COUNT = 19;
const V2_SELLER_NONCE_FIELD = 6;
const V2_AGENT_IDENTIFIER_FIELD = 8;
// The seller nonce is a 32-byte hash; the payment service appends the agent
// identifier to it (always in V1, only in older V2 datums).
const SELLER_NONCE_HEX_LENGTH = 64;
const HEX = /^[0-9a-f]+$/i;

type PlutusBytes = { bytes?: unknown };
type PlutusConstr = { fields?: unknown };

function bytesField(fields: unknown[], index: number): string | null {
  const bytes = (fields[index] as PlutusBytes | undefined)?.bytes;
  return typeof bytes === 'string' ? bytes : null;
}

function asAgentIdentifier(value: string | null): string | null {
  return value != null && value.length > 0 && HEX.test(value)
    ? value.toLowerCase()
    : null;
}

// Agent identifier of a decoded escrow datum, or null when the datum is not a
// masumi escrow datum or predates agent identifiers (unattributable).
export function agentIdentifierFromEscrowDatum(datum: unknown): string | null {
  const fields = (datum as PlutusConstr | null)?.fields;
  if (!Array.isArray(fields)) return null;

  if (fields.length === V1_DATUM_FIELD_COUNT) {
    const sellerNonce = bytesField(fields, V1_SELLER_NONCE_FIELD);
    return asAgentIdentifier(
      sellerNonce?.slice(SELLER_NONCE_HEX_LENGTH) ?? null
    );
  }
  if (fields.length === V2_DATUM_FIELD_COUNT) {
    const agentIdentifier = bytesField(fields, V2_AGENT_IDENTIFIER_FIELD);
    if (agentIdentifier != null && agentIdentifier.length > 0) {
      return asAgentIdentifier(agentIdentifier);
    }
    const sellerNonce = bytesField(fields, V2_SELLER_NONCE_FIELD);
    return asAgentIdentifier(
      sellerNonce?.slice(SELLER_NONCE_HEX_LENGTH) ?? null
    );
  }
  return null;
}

type TxInput = {
  tx_hash: string;
  output_index: number;
  collateral?: boolean;
  reference?: boolean;
  inline_datum?: string | null;
};

// A spend redeemer's index points into the transaction's spent inputs in
// ledger order (by tx hash, then output index); collateral and reference
// inputs are not part of that list.
export function spentInputForRedeemer<T extends TxInput>(
  inputs: readonly T[],
  redeemerIndex: number
): T | undefined {
  const spent = inputs
    .filter((input) => !input.collateral && !input.reference)
    .sort((left, right) =>
      left.tx_hash === right.tx_hash
        ? left.output_index - right.output_index
        : left.tx_hash < right.tx_hash
          ? -1
          : 1
    );
  return spent[redeemerIndex];
}
