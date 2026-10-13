import {
  byteString,
  conStr0,
  conStr1,
  integer,
  pubKeyAddress,
  scriptAddress,
  serializeAddressObj,
  serializeData,
} from '@meshsdk/core';
import { Network } from '@prisma/client';
import { prisma } from '@/utils/db';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import { logger } from '@/utils/logger';
import { updateSuccessfulPurchaseIndex } from './purchase-indexer.service';

jest.mock('@/utils/db', () => ({
  prisma: {
    registrySource: { findFirst: jest.fn() },
    paymentContractSyncState: { upsert: jest.fn(), update: jest.fn() },
    agentSuccessfulPurchase: { findMany: jest.fn(), upsert: jest.fn() },
  },
}));

jest.mock('@/utils/blockfrost', () => ({ getBlockfrostInstance: jest.fn() }));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const V1_SCRIPT_HASH =
  'bd2adb685621e224aae7571cb6bd8f0beb0fdd31875eb3a27feee6c0';
const WITHDRAW_HASH = 'withdraw-redeemer-hash';
const SUBMIT_RESULT_HASH = 'submit-result-redeemer-hash';
const NONCE = 'ab'.repeat(32);
const AGENT = `${'7e'.repeat(28)}${'cd'.repeat(32)}`;
const UNMINTED_AGENT = `${'7e'.repeat(28)}${'ef'.repeat(32)}`;
const SELLER = '5e'.repeat(28);
const BUYER = 'b0'.repeat(28);
const STRANGER = '99'.repeat(28);
const BLOCK_TIME = 1_700_000_000;

const bech32 = (keyHash: string) =>
  serializeAddressObj(pubKeyAddress(keyHash), 0);
const CONTRACT_ADDRESS = serializeAddressObj(scriptAddress(V1_SCRIPT_HASH), 0);
const keyAddress = (keyHash: string) =>
  conStr0([conStr0([byteString(keyHash)]), conStr1([])]);

// V1 escrow datum as inline CBOR, the way Blockfrost returns it.
function v1EscrowDatum(params: {
  agentIdentifier: string;
  seller?: string;
  buyer?: string;
}) {
  const fields = Array.from({ length: 16 }, () => integer(0)) as unknown[];
  fields[0] = keyAddress(params.buyer ?? BUYER);
  fields[1] = keyAddress(params.seller ?? SELLER);
  fields[4] = byteString(NONCE + params.agentIdentifier);
  fields[6] = integer(2_000_000);
  return serializeData(conStr0(fields as never[]), 'JSON');
}

// The escrow a Withdraw spends was re-locked by the seller's SubmitResult tx,
// which itself spent the buyer's original lock.
function escrowInput(inlineDatum: string, createdBy = 'submit-result-tx') {
  return {
    tx_hash: createdBy,
    output_index: 0,
    address: CONTRACT_ADDRESS,
    amount: [
      { unit: 'lovelace', quantity: '7000000' },
      { unit: 'usdm-unit', quantity: '25000000' },
    ],
    inline_datum: inlineDatum,
  };
}

function redeemer(tx_hash: string, redeemer_data_hash: string, tx_index = 0) {
  return { tx_hash, tx_index, purpose: 'spend', redeemer_data_hash };
}

describe('updateSuccessfulPurchaseIndex', () => {
  const blockfrost = {
    scriptsRedeemers: jest.fn(),
    scriptsDatum: jest.fn(),
    txsUtxos: jest.fn(),
    txs: jest.fn(),
    assetsById: jest.fn(),
  };
  let withdrawalDatum: string;
  let lockTxFunder: string;

  const upsertedPurchases = () =>
    (prisma.agentSuccessfulPurchase.upsert as jest.Mock).mock.calls.map(
      ([args]) => args.create
    );

  beforeEach(() => {
    jest.clearAllMocks();
    withdrawalDatum = v1EscrowDatum({ agentIdentifier: AGENT });
    lockTxFunder = BUYER;
    (getBlockfrostInstance as jest.Mock).mockReturnValue(blockfrost);
    (prisma.registrySource.findFirst as jest.Mock).mockImplementation(
      ({ where }: { where: { network: Network } }) =>
        where.network === Network.Preprod
          ? { RegistrySourceConfig: { rpcProviderApiKey: 'key' } }
          : null
    );
    (prisma.paymentContractSyncState.upsert as jest.Mock).mockImplementation(
      ({ create }: { create: { scriptHash: string } }) => ({
        id: create.scriptHash,
        lastCheckedPage: 1,
      })
    );
    (prisma.agentSuccessfulPurchase.findMany as jest.Mock).mockResolvedValue(
      []
    );
    blockfrost.scriptsDatum.mockImplementation((hash: string) => ({
      json_value: { constructor: hash === WITHDRAW_HASH ? 0 : 5 },
    }));
    blockfrost.scriptsRedeemers.mockImplementation((scriptHash: string) =>
      scriptHash === V1_SCRIPT_HASH
        ? [
            redeemer('tx-withdraw', WITHDRAW_HASH),
            redeemer('tx-submit', SUBMIT_RESULT_HASH),
          ]
        : []
    );
    blockfrost.assetsById.mockImplementation((asset: string) => {
      if (asset === AGENT) return { initial_mint_tx_hash: 'mint-tx' };
      throw Object.assign(new Error('Not Found'), { status_code: 404 });
    });
    blockfrost.txs.mockResolvedValue({ block_time: BLOCK_TIME });
    blockfrost.txsUtxos.mockImplementation((txHash: string) => {
      if (txHash === 'mint-tx') {
        return { inputs: [{ address: bech32(SELLER) }] };
      }
      if (txHash === 'submit-result-tx') {
        return {
          inputs: [
            escrowInput(withdrawalDatum, 'lock-tx'),
            { address: bech32(SELLER) },
          ],
        };
      }
      if (txHash === 'lock-tx') {
        return { inputs: [{ address: bech32(lockTxFunder) }] };
      }
      return { inputs: [escrowInput(withdrawalDatum)] };
    });
  });

  it('records an attributed withdrawal with buyer, block time and amounts', async () => {
    await updateSuccessfulPurchaseIndex();

    expect(upsertedPurchases()).toEqual([
      {
        network: Network.Preprod,
        txHash: 'tx-withdraw',
        redeemerIndex: 0,
        agentIdentifier: AGENT,
        buyerKeyHash: BUYER,
        blockTime: new Date(BLOCK_TIME * 1000),
        Amounts: {
          create: [
            { unit: 'lovelace', quantity: 5_000_000n },
            { unit: 'usdm-unit', quantity: 25_000_000n },
          ],
        },
      },
    ]);
    // SubmitResult is not a purchase outcome, so its tx is never fetched.
    expect(blockfrost.txsUtxos).not.toHaveBeenCalledWith('tx-submit');
  });

  it('keeps a withdrawal by a seller that did not mint the agent unattributed', async () => {
    withdrawalDatum = v1EscrowDatum({
      agentIdentifier: AGENT,
      seller: STRANGER,
    });

    await updateSuccessfulPurchaseIndex();

    expect(upsertedPurchases()).toEqual([
      { network: Network.Preprod, txHash: 'tx-withdraw', redeemerIndex: 0 },
    ]);
    expect(blockfrost.txs).not.toHaveBeenCalled();
  });

  it('rejects a malformed agent identifier without looking it up', async () => {
    withdrawalDatum = v1EscrowDatum({ agentIdentifier: 'abcd' });

    await updateSuccessfulPurchaseIndex();

    expect(upsertedPurchases()).toEqual([
      { network: Network.Preprod, txHash: 'tx-withdraw', redeemerIndex: 0 },
    ]);
    expect(blockfrost.assetsById).not.toHaveBeenCalled();
  });

  it('records a rejected asset lookup (400) as unattributed instead of retrying forever', async () => {
    const rejectedAgent = `${'7e'.repeat(28)}${'aa'.repeat(32)}`;
    withdrawalDatum = v1EscrowDatum({ agentIdentifier: rejectedAgent });
    blockfrost.assetsById.mockRejectedValueOnce(
      Object.assign(new Error('Bad Request'), { status_code: 400 })
    );

    await updateSuccessfulPurchaseIndex();

    expect(upsertedPurchases()).toEqual([
      { network: Network.Preprod, txHash: 'tx-withdraw', redeemerIndex: 0 },
    ]);
  });

  it('keeps a withdrawal for a never-minted agent unattributed', async () => {
    withdrawalDatum = v1EscrowDatum({ agentIdentifier: UNMINTED_AGENT });

    await updateSuccessfulPurchaseIndex();

    expect(upsertedPurchases()).toEqual([
      { network: Network.Preprod, txHash: 'tx-withdraw', redeemerIndex: 0 },
    ]);
  });

  it('drops a buyer that did not fund the escrow', async () => {
    lockTxFunder = STRANGER;

    await updateSuccessfulPurchaseIndex();

    expect(upsertedPurchases()[0]).toMatchObject({
      agentIdentifier: AGENT,
      buyerKeyHash: null,
    });
  });

  it('drops a buyer that is the seller', async () => {
    withdrawalDatum = v1EscrowDatum({ agentIdentifier: AGENT, buyer: SELLER });
    lockTxFunder = SELLER;

    await updateSuccessfulPurchaseIndex();

    expect(upsertedPurchases()[0]).toMatchObject({
      agentIdentifier: AGENT,
      buyerKeyHash: null,
    });
  });

  it('does not refetch withdrawals recorded on an earlier pass', async () => {
    (prisma.agentSuccessfulPurchase.findMany as jest.Mock).mockResolvedValue([
      { txHash: 'tx-withdraw', redeemerIndex: 0 },
    ]);

    await updateSuccessfulPurchaseIndex();

    expect(blockfrost.txsUtxos).not.toHaveBeenCalledWith('tx-withdraw');
    expect(prisma.agentSuccessfulPurchase.upsert).not.toHaveBeenCalled();
  });

  it('advances the cursor past full pages and stays on the partial tip page', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      redeemer(`tx-${index}`, SUBMIT_RESULT_HASH)
    );
    blockfrost.scriptsRedeemers.mockImplementation(
      (scriptHash: string, { page }: { page: number }) =>
        scriptHash === V1_SCRIPT_HASH && page === 1 ? fullPage : []
    );

    await updateSuccessfulPurchaseIndex();

    expect(prisma.paymentContractSyncState.update).toHaveBeenCalledTimes(1);
    expect(prisma.paymentContractSyncState.update).toHaveBeenCalledWith({
      where: { id: V1_SCRIPT_HASH },
      data: { lastCheckedPage: 2 },
    });
  });

  it('keeps indexing other contracts and releases the mutex after a failure', async () => {
    blockfrost.scriptsRedeemers.mockRejectedValueOnce(new Error('rate limit'));

    await updateSuccessfulPurchaseIndex();
    expect(logger.error).toHaveBeenCalledWith(
      'Error indexing payment contract purchases',
      expect.objectContaining({ scriptHash: V1_SCRIPT_HASH })
    );

    await updateSuccessfulPurchaseIndex();
    expect(prisma.agentSuccessfulPurchase.upsert).toHaveBeenCalledTimes(1);
  });

  it('logs a network-level failure instead of dropping it', async () => {
    (prisma.registrySource.findFirst as jest.Mock).mockRejectedValue(
      new Error('db down')
    );

    await updateSuccessfulPurchaseIndex();

    expect(logger.error).toHaveBeenCalledWith(
      'Error indexing network purchases',
      expect.objectContaining({ network: Network.Preprod })
    );
  });

  it('skips a concurrent run while indexing is in progress', async () => {
    let finish: (value: unknown[]) => void = () => {};
    blockfrost.scriptsRedeemers.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    );

    const running = updateSuccessfulPurchaseIndex();
    await new Promise((resolve) => setImmediate(resolve));
    await updateSuccessfulPurchaseIndex();

    expect(logger.info).toHaveBeenCalledWith(
      'Mutex timeout when locking',
      expect.anything()
    );
    finish([]);
    await running;
  });
});
