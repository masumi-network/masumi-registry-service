import { $Enums } from '@prisma/client';
import { Mutex, tryAcquire, MutexInterface } from 'async-mutex';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { deserializeAddress, deserializeDatum } from '@meshsdk/core';
import { DEFAULTS } from '@/utils/config';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import {
  WITHDRAW_REDEEMER_CONSTRUCTOR,
  agentIdentifierFromEscrowDatum,
  spentInputForRedeemer,
} from './escrow-withdrawal';

const REDEEMERS_PER_PAGE = 100;
// ponytail: bounds Blockfrost calls per run; a long first backfill finishes
// over several runs via the persisted page cursor.
const MAX_PAGES_PER_CONTRACT_PER_RUN = 20;

// Redeemer data is content-addressed, so hash -> constructor never changes.
const redeemerConstructorCache = new Map<string, number | null>();

async function redeemerConstructor(
  blockfrost: BlockFrostAPI,
  redeemerDataHash: string
): Promise<number | null> {
  const cached = redeemerConstructorCache.get(redeemerDataHash);
  if (cached !== undefined) return cached;
  const datum = await blockfrost.scriptsDatum(redeemerDataHash);
  const constructor = (datum.json_value as { constructor?: unknown })
    ?.constructor;
  const value = typeof constructor === 'number' ? constructor : null;
  redeemerConstructorCache.set(redeemerDataHash, value);
  return value;
}

async function withdrawnAgentIdentifier(
  blockfrost: BlockFrostAPI,
  txHash: string,
  redeemerIndex: number
): Promise<string | null> {
  const utxos = await blockfrost.txsUtxos(txHash);
  const input = spentInputForRedeemer(utxos.inputs, redeemerIndex);
  if (input?.inline_datum == null) return null;
  return agentIdentifierFromEscrowDatum(deserializeDatum(input.inline_datum));
}

async function indexContractPage(params: {
  blockfrost: BlockFrostAPI;
  network: $Enums.Network;
  scriptHash: string;
  page: number;
}): Promise<number> {
  const redeemers = await params.blockfrost.scriptsRedeemers(
    params.scriptHash,
    { page: params.page, count: REDEEMERS_PER_PAGE, order: 'asc' }
  );

  const withdrawals: { txHash: string; redeemerIndex: number }[] = [];
  for (const redeemer of redeemers) {
    if (redeemer.purpose !== 'spend') continue;
    const constructor = await redeemerConstructor(
      params.blockfrost,
      redeemer.redeemer_data_hash
    );
    if (constructor !== WITHDRAW_REDEEMER_CONSTRUCTOR) continue;
    withdrawals.push({
      txHash: redeemer.tx_hash,
      redeemerIndex: redeemer.tx_index,
    });
  }

  // The last page is re-read every run until it fills up; skip the tx lookups
  // for withdrawals indexed on an earlier pass.
  const alreadyIndexed = await prisma.agentSuccessfulPurchase.findMany({
    where: {
      network: params.network,
      txHash: { in: withdrawals.map((withdrawal) => withdrawal.txHash) },
    },
    select: { txHash: true, redeemerIndex: true },
  });
  const indexedKeys = new Set(
    alreadyIndexed.map((row) => `${row.txHash}#${row.redeemerIndex}`)
  );

  const rows = [];
  for (const withdrawal of withdrawals) {
    if (indexedKeys.has(`${withdrawal.txHash}#${withdrawal.redeemerIndex}`)) {
      continue;
    }
    const agentIdentifier = await withdrawnAgentIdentifier(
      params.blockfrost,
      withdrawal.txHash,
      withdrawal.redeemerIndex
    );
    if (agentIdentifier == null) continue;
    rows.push({ network: params.network, agentIdentifier, ...withdrawal });
  }
  if (rows.length > 0) {
    await prisma.agentSuccessfulPurchase.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }
  return redeemers.length;
}

async function indexContract(params: {
  blockfrost: BlockFrostAPI;
  network: $Enums.Network;
  scriptHash: string;
}) {
  const state = await prisma.paymentContractSyncState.upsert({
    where: {
      network_scriptHash: {
        network: params.network,
        scriptHash: params.scriptHash,
      },
    },
    update: {},
    create: { network: params.network, scriptHash: params.scriptHash },
  });

  let page = state.lastCheckedPage;
  for (let pages = 0; pages < MAX_PAGES_PER_CONTRACT_PER_RUN; pages++) {
    const redeemerCount = await indexContractPage({ ...params, page });
    // A partial page is the chain tip: keep the cursor on it for the next run.
    if (redeemerCount < REDEEMERS_PER_PAGE) return;
    page = page + 1;
    await prisma.paymentContractSyncState.update({
      where: { id: state.id },
      data: { lastCheckedPage: page },
    });
  }
}

async function indexNetwork(network: $Enums.Network) {
  const source = await prisma.registrySource.findFirst({
    where: { network },
    include: { RegistrySourceConfig: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (source == null) return;

  const contractAddresses =
    network === $Enums.Network.Mainnet
      ? DEFAULTS.PAYMENT_CONTRACT_ADDRESSES_MAINNET
      : DEFAULTS.PAYMENT_CONTRACT_ADDRESSES_PREPROD;
  const blockfrost = getBlockfrostInstance(
    network,
    source.RegistrySourceConfig.rpcProviderApiKey
  );

  for (const address of contractAddresses) {
    const { scriptHash } = deserializeAddress(address);
    try {
      await indexContract({ blockfrost, network, scriptHash });
    } catch (error) {
      logger.error('Error indexing payment contract purchases', {
        error,
        network,
        scriptHash,
      });
    }
  }
}

const indexMutex = new Mutex();

// Counts successful purchases (seller withdrawals) per agent from the payment
// contracts on chain, for ranking. Not self-reported: the payment service only
// sees its own purchases, the chain sees everyone's.
export async function updateSuccessfulPurchaseIndex() {
  let release: MutexInterface.Releaser;
  try {
    release = await tryAcquire(indexMutex).acquire();
  } catch (e) {
    logger.info('Mutex timeout when locking', { error: e });
    return;
  }
  try {
    await Promise.allSettled(
      Object.values($Enums.Network).map((network) => indexNetwork(network))
    );
  } finally {
    release();
  }
}
