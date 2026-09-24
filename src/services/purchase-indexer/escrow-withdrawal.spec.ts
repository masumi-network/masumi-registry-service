import {
  agentIdentifierFromEscrowDatum,
  spentInputForRedeemer,
} from './escrow-withdrawal';

const NONCE = 'ab'.repeat(32);
const AGENT = `${'7e'.repeat(28)}${'cd'.repeat(32)}`;

function datum(fieldCount: number, overrides: Record<number, unknown>) {
  return {
    constructor: 0n,
    fields: Array.from(
      { length: fieldCount },
      (_, index) => overrides[index] ?? { int: 0n }
    ),
  };
}

describe('agentIdentifierFromEscrowDatum', () => {
  it('reads a V1 agent identifier appended to the seller nonce', () => {
    expect(
      agentIdentifierFromEscrowDatum(datum(16, { 4: { bytes: NONCE + AGENT } }))
    ).toBe(AGENT);
  });

  it('reads the dedicated V2 agent identifier field', () => {
    expect(
      agentIdentifierFromEscrowDatum(
        datum(19, { 6: { bytes: NONCE }, 8: { bytes: AGENT } })
      )
    ).toBe(AGENT);
  });

  it('falls back to the V2 seller nonce suffix for older V2 datums', () => {
    expect(
      agentIdentifierFromEscrowDatum(
        datum(19, { 6: { bytes: NONCE + AGENT }, 8: { bytes: '' } })
      )
    ).toBe(AGENT);
  });

  it('returns null for purchases that predate agent identifiers', () => {
    expect(
      agentIdentifierFromEscrowDatum(datum(16, { 4: { bytes: NONCE } }))
    ).toBeNull();
  });

  it.each([
    ['a non-escrow datum', datum(3, { 0: { bytes: AGENT } })],
    ['a missing datum', null],
    ['a non-bytes nonce', datum(16, { 4: { int: 1n } })],
    ['a non-hex agent identifier', datum(16, { 4: { bytes: NONCE + 'zz' } })],
  ])('rejects %s', (_label, value) => {
    expect(agentIdentifierFromEscrowDatum(value)).toBeNull();
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
