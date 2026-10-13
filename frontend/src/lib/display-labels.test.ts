import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAmount, formatUptime, unitLabel } from './display-labels';

describe('unitLabel', () => {
  it('names lovelace by network and keeps other units as written', () => {
    assert.equal(unitLabel('', 'Mainnet'), 'ADA');
    assert.equal(unitLabel('lovelace', 'Preprod'), 'tADA');
    assert.equal(unitLabel('abc123', 'Mainnet'), 'abc123');
  });
});

describe('formatAmount', () => {
  it('scales lovelace by 6 places and drops trailing zeros', () => {
    assert.deepEqual(formatAmount('1500000', '', 'Mainnet'), {
      amount: '1.5',
      unit: 'ADA',
      inBaseUnits: false,
    });
    assert.equal(formatAmount('2000000', 'lovelace', 'Mainnet').amount, '2');
  });

  it('keeps precision beyond Number.MAX_SAFE_INTEGER', () => {
    assert.equal(
      formatAmount('123456789012345678901', '', 'Mainnet').amount,
      '123,456,789,012,345.678901',
    );
  });

  it('scales a token only when its decimals are known', () => {
    assert.deepEqual(formatAmount('12345', 'tok', 'Mainnet', 2), {
      amount: '123.45',
      unit: 'tok',
      inBaseUnits: false,
    });
    assert.deepEqual(formatAmount('12345', 'tok', 'Mainnet'), {
      amount: '12,345',
      unit: 'tok',
      inBaseUnits: true,
    });
  });

  it('shows a non-numeric amount unchanged instead of throwing', () => {
    assert.equal(formatAmount('1e9', '', 'Mainnet').amount, '1e9');
    assert.equal(formatAmount('-5', '', 'Mainnet').amount, '-5');
  });
});

describe('formatUptime', () => {
  it('floors the share, so an imperfect record never reads 100%', () => {
    assert.equal(formatUptime(999, 1000), '99%');
    assert.equal(formatUptime(0, 0), '—');
  });
});
