import { Network } from '@prisma/client';
import { prisma } from '@/utils/db';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import { logger } from '@/utils/logger';
import { updateSuccessfulPurchaseIndex } from './purchase-indexer.service';

jest.mock('@/utils/db', () => ({
  prisma: {
    registrySource: { findFirst: jest.fn() },
    paymentContractSyncState: { upsert: jest.fn(), update: jest.fn() },
    agentSuccessfulPurchase: { findMany: jest.fn(), createMany: jest.fn() },
  },
}));

jest.mock('@/utils/blockfrost', () => ({ getBlockfrostInstance: jest.fn() }));

jest.mock('@meshsdk/core', () => ({
  ...jest.requireActual('@meshsdk/core'),
  // Inline datums in these fixtures are JSON, not CBOR.
  deserializeDatum: (datum: string) => JSON.parse(datum),
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const V1_SCRIPT_HASH =
  'bd2adb685621e224aae7571cb6bd8f0beb0fdd31875eb3a27feee6c0';
const WITHDRAW_HASH = 'withdraw-redeemer-hash';
const SUBMIT_RESULT_HASH = 'submit-result-redeemer-hash';
const AGENT = `${'7e'.repeat(28)}${'cd'.repeat(32)}`;

function escrowInput(sellerNonce: string) {
  return {
    tx_hash: 'aa',
    output_index: 0,
    inline_datum: JSON.stringify({
      fields: Array.from({ length: 16 }, (_, index) =>
        index === 4 ? { bytes: sellerNonce } : { int: 0 }
      ),
    }),
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
            redeemer('tx-legacy', WITHDRAW_HASH),
          ]
        : []
    );
    blockfrost.txsUtxos.mockImplementation((txHash: string) => ({
      inputs: [
        escrowInput(
          txHash === 'tx-legacy' ? 'ab'.repeat(32) : 'ab'.repeat(32) + AGENT
        ),
      ],
    }));
  });

  it('records only attributable seller withdrawals as successful purchases', async () => {
    await updateSuccessfulPurchaseIndex();

    expect(prisma.agentSuccessfulPurchase.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.agentSuccessfulPurchase.createMany).toHaveBeenCalledWith({
      data: [
        {
          network: Network.Preprod,
          agentIdentifier: AGENT,
          txHash: 'tx-withdraw',
          redeemerIndex: 0,
        },
      ],
      skipDuplicates: true,
    });
    // SubmitResult is not a purchase outcome, so its tx is never fetched.
    expect(blockfrost.txsUtxos).not.toHaveBeenCalledWith('tx-submit');
  });

  it('does not refetch withdrawals indexed on an earlier pass', async () => {
    (prisma.agentSuccessfulPurchase.findMany as jest.Mock).mockResolvedValue([
      { txHash: 'tx-withdraw', redeemerIndex: 0 },
    ]);

    await updateSuccessfulPurchaseIndex();

    expect(blockfrost.txsUtxos).not.toHaveBeenCalledWith('tx-withdraw');
    expect(prisma.agentSuccessfulPurchase.createMany).not.toHaveBeenCalled();
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
    expect(prisma.agentSuccessfulPurchase.createMany).toHaveBeenCalledTimes(1);
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
