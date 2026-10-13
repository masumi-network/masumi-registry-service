import { deserializeAddress } from '@meshsdk/core';

// Decoding helpers for masumi payment escrow withdrawals. Layouts mirror
// masumi-payment-service smart-contracts/payment{,-v2}/validators/vested_pay.ak.

// Withdraw is redeemer constructor 0 in both contract versions: the seller
// collects the escrow after delivering, i.e. a successful purchase.
export const WITHDRAW_REDEEMER_CONSTRUCTOR = 0;

// Field positions of the escrow datum (Datum in vested_pay.ak).
const V1_DATUM_FIELDS = {
  count: 16,
  buyer: 0,
  seller: 1,
  sellerNonce: 4,
  collateralReturnLovelace: 6,
  agentIdentifier: null,
} as const;
const V2_DATUM_FIELDS = {
  count: 19,
  buyer: 0,
  seller: 2,
  sellerNonce: 6,
  collateralReturnLovelace: 9,
  agentIdentifier: 8,
} as const;
// The seller nonce is a 32-byte hash; the payment service appends the agent
// identifier to it (always in V1, only in older V2 datums).
const SELLER_NONCE_HEX_LENGTH = 64;
// Plutus Credential constructor of a key (not script) payment credential.
const VERIFICATION_KEY_CREDENTIAL = 0;
const HEX = /^[0-9a-f]+$/i;
// Cardano asset id: 28-byte policy id plus a 1-32 byte asset name.
const ASSET_ID = /^[0-9a-f]{56}(?:[0-9a-f]{2}){1,32}$/;

type PlutusField = { bytes?: unknown; int?: unknown; fields?: unknown };

function bytesField(fields: unknown[], index: number): string | null {
  const bytes = (fields[index] as PlutusField | undefined)?.bytes;
  return typeof bytes === 'string' ? bytes : null;
}

function intField(fields: unknown[], index: number): bigint | null {
  const value = (fields[index] as PlutusField | undefined)?.int;
  return typeof value === 'bigint' || typeof value === 'number'
    ? BigInt(value)
    : null;
}

function constructorOf(value: unknown): number | null {
  const constructor = (value as { constructor?: unknown } | null)?.constructor;
  return typeof constructor === 'bigint' || typeof constructor === 'number'
    ? Number(constructor)
    : null;
}

// Payment key hash of a Plutus Address, null for a script credential.
function addressKeyHash(address: unknown): string | null {
  const credential = (
    (address as PlutusField | null)?.fields as unknown[] | undefined
  )?.[0];
  if (constructorOf(credential) !== VERIFICATION_KEY_CREDENTIAL) return null;
  const fields = (credential as PlutusField).fields;
  return Array.isArray(fields) ? asHex(bytesField(fields, 0)) : null;
}

function asHex(value: string | null): string | null {
  return value != null && value.length > 0 && HEX.test(value)
    ? value.toLowerCase()
    : null;
}

export type EscrowDatum = {
  // Null when the datum predates agent identifiers (unattributable).
  agentIdentifier: string | null;
  sellerKeyHash: string | null;
  buyerKeyHash: string | null;
  collateralReturnLovelace: bigint;
};

// Reads a decoded escrow datum, or null when it is not a masumi escrow datum.
export function decodeEscrowDatum(datum: unknown): EscrowDatum | null {
  const fields = (datum as PlutusField | null)?.fields;
  if (!Array.isArray(fields)) return null;
  const layout =
    fields.length === V1_DATUM_FIELDS.count
      ? V1_DATUM_FIELDS
      : fields.length === V2_DATUM_FIELDS.count
        ? V2_DATUM_FIELDS
        : null;
  if (layout == null) return null;

  const dedicatedAgentIdentifier =
    layout.agentIdentifier == null
      ? null
      : bytesField(fields, layout.agentIdentifier);
  const agentIdentifier =
    dedicatedAgentIdentifier != null && dedicatedAgentIdentifier.length > 0
      ? dedicatedAgentIdentifier
      : (bytesField(fields, layout.sellerNonce)?.slice(
          SELLER_NONCE_HEX_LENGTH
        ) ?? null);
  const agentIdentifierHex = asHex(agentIdentifier);
  return {
    agentIdentifier:
      agentIdentifierHex != null && ASSET_ID.test(agentIdentifierHex)
        ? agentIdentifierHex
        : null,
    sellerKeyHash: addressKeyHash(fields[layout.seller]),
    buyerKeyHash: addressKeyHash(fields[layout.buyer]),
    collateralReturnLovelace:
      intField(fields, layout.collateralReturnLovelace) ?? 0n,
  };
}

// Payment key hashes of the given bech32 addresses (script and Byron
// addresses are skipped).
export function addressKeyHashes(addresses: readonly string[]): Set<string> {
  const keyHashes = new Set<string>();
  for (const address of addresses) {
    try {
      const keyHash = asHex(deserializeAddress(address).pubKeyHash);
      if (keyHash != null) keyHashes.add(keyHash);
    } catch {
      // Not a Shelley address: no payment key hash.
    }
  }
  return keyHashes;
}

// Payment script hash of a bech32 address, null for key or invalid addresses.
export function addressScriptHash(address: string): string | null {
  try {
    return asHex(deserializeAddress(address).scriptHash);
  } catch {
    return null;
  }
}

// Value the buyer paid: the escrow value minus the lovelace the seller must
// return to the buyer as collateral. Zero quantities are dropped.
export function purchaseAmounts(
  escrowValue: readonly { unit: string; quantity: string }[],
  collateralReturnLovelace: bigint
): { unit: string; quantity: bigint }[] {
  return escrowValue
    .map((amount) => {
      const quantity = BigInt(amount.quantity);
      return {
        unit: amount.unit,
        quantity:
          amount.unit === 'lovelace'
            ? quantity > collateralReturnLovelace
              ? quantity - collateralReturnLovelace
              : 0n
            : quantity,
      };
    })
    .filter((amount) => amount.quantity > 0n);
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
