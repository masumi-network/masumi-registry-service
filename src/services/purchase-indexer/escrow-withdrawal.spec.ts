import {
  byteString,
  conStr0,
  conStr1,
  deserializeDatum,
  integer,
  pubKeyAddress,
  scriptAddress,
  serializeAddressObj,
  serializeData,
} from '@meshsdk/core';
import {
  addressKeyHashes,
  decodeEscrowDatum,
  purchaseAmounts,
  spentInputForRedeemer,
} from './escrow-withdrawal';

const NONCE = 'ab'.repeat(32);
const AGENT = `${'7e'.repeat(28)}${'cd'.repeat(32)}`;
const SELLER = '5e'.repeat(28);
const BUYER = 'b0'.repeat(28);

const keyAddress = (keyHash: string) =>
  conStr0([conStr0([byteString(keyHash)]), conStr1([])]);
const scriptCredentialAddress = (scriptHash: string) =>
  conStr0([conStr1([byteString(scriptHash)]), conStr1([])]);

// Builds an escrow datum and round-trips it through CBOR, so the decoder sees
// exactly what @meshsdk/core hands the indexer (bigint constructors and ints).
function escrowDatum(fieldCount: 16 | 19, overrides: Record<number, unknown>) {
  const fields = Array.from(
    { length: fieldCount },
    (_, index) => overrides[index] ?? integer(0)
  );
  return deserializeDatum(
    serializeData(conStr0(fields as never[]), 'JSON')
  ) as unknown;
}

describe('decodeEscrowDatum', () => {
  it('reads a V1 datum: agent identifier appended to the seller nonce', () => {
    expect(
      decodeEscrowDatum(
        escrowDatum(16, {
          0: keyAddress(BUYER),
          1: keyAddress(SELLER),
          4: byteString(NONCE + AGENT),
          5: byteString('b1'),
          6: integer(2_000_000),
        })
      )
    ).toEqual({
      agentIdentifier: AGENT,
      sellerKeyHash: SELLER,
      buyerKeyHash: BUYER,
      collateralReturnLovelace: 2_000_000n,
      escrowKey: `${NONCE + AGENT}:b1`,
    });
  });

  it('reads the dedicated V2 agent identifier field and V2 positions', () => {
    expect(
      decodeEscrowDatum(
        escrowDatum(19, {
          0: keyAddress(BUYER),
          2: keyAddress(SELLER),
          6: byteString(NONCE),
          7: byteString('b2'),
          8: byteString(AGENT),
          9: integer(1_500_000),
        })
      )
    ).toEqual({
      agentIdentifier: AGENT,
      sellerKeyHash: SELLER,
      buyerKeyHash: BUYER,
      collateralReturnLovelace: 1_500_000n,
      escrowKey: `${NONCE}:b2`,
    });
  });

  it('falls back to the V2 seller nonce suffix for older V2 datums', () => {
    expect(
      decodeEscrowDatum(
        escrowDatum(19, { 6: byteString(NONCE + AGENT), 8: byteString('') })
      )?.agentIdentifier
    ).toBe(AGENT);
  });

  it('has no agent identifier for purchases that predate them', () => {
    expect(
      decodeEscrowDatum(escrowDatum(16, { 4: byteString(NONCE) }))
        ?.agentIdentifier
    ).toBeNull();
  });

  it('has no key hash for a script credential buyer', () => {
    expect(
      decodeEscrowDatum(escrowDatum(16, { 0: scriptCredentialAddress(BUYER) }))
        ?.buyerKeyHash
    ).toBeNull();
  });

  it.each([
    ['a non-escrow datum', { fields: [{ bytes: AGENT }] }],
    ['a missing datum', null],
  ])('rejects %s', (_label, value) => {
    expect(decodeEscrowDatum(value)).toBeNull();
  });

  it('rejects a non-hex agent identifier', () => {
    // Not valid CBOR bytes, so built as the decoded shape directly.
    const fields = Array.from({ length: 16 }, (_, index) =>
      index === 4 ? { bytes: NONCE + 'zz' } : { int: 0n }
    );
    expect(decodeEscrowDatum({ fields })?.agentIdentifier).toBeNull();
  });
});

describe('addressKeyHashes', () => {
  it('collects payment key hashes and skips script and invalid addresses', () => {
    const keyAddressBech32 = serializeAddressObj(pubKeyAddress(SELLER), 0);
    const scriptAddressBech32 = serializeAddressObj(scriptAddress(BUYER), 0);

    expect(
      addressKeyHashes([keyAddressBech32, scriptAddressBech32, 'not-an-addr'])
    ).toEqual(new Set([SELLER]));
  });
});

describe('purchaseAmounts', () => {
  it('subtracts the collateral return from lovelace and keeps tokens', () => {
    expect(
      purchaseAmounts(
        [
          { unit: 'lovelace', quantity: '7000000' },
          { unit: 'usdm-unit', quantity: '25000000' },
        ],
        2_000_000n
      )
    ).toEqual([
      { unit: 'lovelace', quantity: 5_000_000n },
      { unit: 'usdm-unit', quantity: 25_000_000n },
    ]);
  });

  it('drops lovelace that only covers the collateral return', () => {
    expect(
      purchaseAmounts(
        [
          { unit: 'lovelace', quantity: '2000000' },
          { unit: 'usdc-unit', quantity: '10' },
        ],
        2_000_000n
      )
    ).toEqual([{ unit: 'usdc-unit', quantity: 10n }]);
  });
});

describe('spentInputForRedeemer', () => {
  const input = (tx_hash: string, output_index: number, extra = {}) => ({
    tx_hash,
    output_index,
    ...extra,
  });

  it('indexes spent inputs in ledger order, ignoring collateral and reference inputs', () => {
    const inputs = [
      input('bb', 0),
      input('aa', 1),
      input('00', 0, { collateral: true }),
      input('01', 0, { reference: true }),
      input('aa', 0),
    ];

    expect(spentInputForRedeemer(inputs, 0)).toEqual(input('aa', 0));
    expect(spentInputForRedeemer(inputs, 1)).toEqual(input('aa', 1));
    expect(spentInputForRedeemer(inputs, 2)).toEqual(input('bb', 0));
    expect(spentInputForRedeemer(inputs, 3)).toBeUndefined();
  });
});
