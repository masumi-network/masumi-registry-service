import { $Enums, Prisma } from '@prisma/client';
import { Mutex, tryAcquire, MutexInterface } from 'async-mutex';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { deserializeAddress, deserializeDatum } from '@meshsdk/core';
import { DEFAULTS } from '@/utils/config';
import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import { getBlockfrostInstance } from '@/utils/blockfrost';
import {
  WITHDRAW_REDEEMER_CONSTRUCTOR,
  addressKeyHashes,
  decodeEscrowDatum,
  purchaseAmounts,
  spentInputForRedeemer,
} from './escrow-withdrawal';

const REDEEMERS_PER_PAGE = 100;
// Bounds Blockfrost calls per run (a full page costs up to ~10 calls per
// withdrawal), so the backfill does not starve the registry sync that shares
// the rate limiter. A long backfill finishes over several runs via the
// persisted page cursor.
const MAX_PAGES_PER_CONTRACT_PER_RUN = 2;

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
  setBounded(redeemerConstructorCache, redeemerDataHash, value);
  return value;
}

// Blockfrost answers these for an asset id that does not exist or is
// malformed: the withdrawal can never be attributed, so it is not retried.
const PERMANENT_LOOKUP_STATUS_CODES = new Set([400, 404]);
// Escrow continuations (SubmitResult, refund requests, ...) re-lock the
// escrow at the contract; this bounds the walk back to the buyer's lock.
const MAX_ESCROW_CHAIN_STEPS = 10;
// Bounds the process-lifetime caches; identifiers come from chain data.
const MAX_CACHE_ENTRIES = 10_000;

function setBounded<K, V>(cache: Map<K, V>, key: K, value: V) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, value);
}

// Payment key hashes that funded an agent's registry NFT mint: the payment
// service mints from the agent's selling wallet. A mint never changes, so the
// result is cached for the process lifetime.
const agentMinterKeyHashCache = new Map<string, Set<string>>();

async function inputKeyHashes(blockfrost: BlockFrostAPI, txHash: string) {
  const utxos = await blockfrost.txsUtxos(txHash);
  return addressKeyHashes(
    utxos.inputs
      .filter((input) => !input.reference && !input.collateral)
      .map((input) => input.address)
  );
}

async function agentMinterKeyHashes(
  blockfrost: BlockFrostAPI,
  network: $Enums.Network,
  agentIdentifier: string
): Promise<Set<string>> {
  const cacheKey = `${network}:${agentIdentifier}`;
  const cached = agentMinterKeyHashCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let keyHashes: Set<string>;
  try {
    const asset = await blockfrost.assetsById(agentIdentifier);
    keyHashes = await inputKeyHashes(blockfrost, asset.initial_mint_tx_hash);
  } catch (error) {
    const statusCode = (error as { status_code?: number }).status_code;
    if (statusCode == null || !PERMANENT_LOOKUP_STATUS_CODES.has(statusCode)) {
      throw error;
    }
    keyHashes = new Set();
  }
  setBounded(agentMinterKeyHashCache, cacheKey, keyHashes);
  return keyHashes;
}

// Payment key hashes that funded the buyer's original escrow lock. The
// withdrawn escrow output usually comes from a continuation tx (the seller's
// SubmitResult), so walk back through the same escrow (matched by its
// reference signature and nonces, not the buyer, which a seller could copy
// into another escrow) to the first lock. Continuations stay at the escrow's
// full address, so the match must be at that address: V2 rejects a duplicate
// reference signature only there, and a copy under another stake credential
// could carry another agent. V1 allows one copy in a Withdraw tx, but its
// agent is part of the key (seller nonce suffix), and a changed buyer fails
// the funder check, so distinct-buyer counts are unaffected (purchase count
// and volume can grow, as with any self-purchase).
async function escrowLockFunderKeyHashes(params: {
  blockfrost: BlockFrostAPI;
  escrowAddress: string;
  escrowKey: string;
  escrowCreatedByTxHash: string;
}): Promise<Set<string>> {
  let txHash = params.escrowCreatedByTxHash;
  for (let step = 0; step < MAX_ESCROW_CHAIN_STEPS; step++) {
    const utxos = await params.blockfrost.txsUtxos(txHash);
    const spent = utxos.inputs.filter(
      (input) => !input.reference && !input.collateral
    );
    const previousEscrow = spent.find(
      (input) =>
        input.address === params.escrowAddress &&
        input.inline_datum != null &&
        decodeEscrowDatum(deserializeDatum(input.inline_datum))?.escrowKey ===
          params.escrowKey
    );
    if (previousEscrow == null) {
      return addressKeyHashes(spent.map((input) => input.address));
    }
    txHash = previousEscrow.tx_hash;
  }
  return new Set();
}

// A withdrawal counts for an agent only when the seller that signed it (the
// contract requires the seller signature) also minted the agent. The buyer is
// kept only when it funded the escrow lock and is not the seller, so a seller
// cannot invent buyers by writing arbitrary keys into the datum.
async function describeWithdrawal(params: {
  blockfrost: BlockFrostAPI;
  network: $Enums.Network;
  txHash: string;
  redeemerIndex: number;
}): Promise<Prisma.AgentSuccessfulPurchaseCreateInput> {
  const { blockfrost, network, txHash, redeemerIndex } = params;
  const unattributed = { network, txHash, redeemerIndex };
  const utxos = await blockfrost.txsUtxos(txHash);
  const input = spentInputForRedeemer(utxos.inputs, redeemerIndex);
  if (input?.inline_datum == null) return unattributed;
  const escrow = decodeEscrowDatum(deserializeDatum(input.inline_datum));
  if (escrow?.agentIdentifier == null || escrow.sellerKeyHash == null) {
    return unattributed;
  }
  const minterKeyHashes = await agentMinterKeyHashes(
    blockfrost,
    network,
    escrow.agentIdentifier
  );
  if (!minterKeyHashes.has(escrow.sellerKeyHash)) return unattributed;

  const buyerKeyHash = escrow.buyerKeyHash;
  const [transaction, buyerFundedEscrow] = await Promise.all([
    blockfrost.txs(txHash),
    buyerKeyHash != null && buyerKeyHash !== escrow.sellerKeyHash
      ? escrowLockFunderKeyHashes({
          blockfrost,
          escrowAddress: input.address,
          escrowKey: escrow.escrowKey,
          escrowCreatedByTxHash: input.tx_hash,
        }).then((funders) => funders.has(buyerKeyHash))
      : false,
  ]);
  // A tx that failed phase-2 validation only took the collateral: the escrow
  // stayed locked, so it is not a purchase.
  if (!transaction.valid_contract) return unattributed;
  return {
    ...unattributed,
    agentIdentifier: escrow.agentIdentifier,
    buyerKeyHash: buyerFundedEscrow ? escrow.buyerKeyHash : null,
    blockTime: new Date(transaction.block_time * 1000),
    Amounts: {
      create: purchaseAmounts(input.amount, escrow.collateralReturnLovelace),
    },
  };
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
  // for withdrawals recorded on an earlier pass (attributed or not).
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

  for (const withdrawal of withdrawals) {
    if (indexedKeys.has(`${withdrawal.txHash}#${withdrawal.redeemerIndex}`)) {
      continue;
    }
    const purchase = await describeWithdrawal({
      blockfrost: params.blockfrost,
      network: params.network,
      ...withdrawal,
    });
    await prisma.agentSuccessfulPurchase.upsert({
      where: {
        network_txHash_redeemerIndex: {
          network: params.network,
          txHash: withdrawal.txHash,
          redeemerIndex: withdrawal.redeemerIndex,
        },
      },
      update: {},
      create: purchase,
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
  // Re-read the last full page: a rollback can shift later redeemers into
  // it. Already indexed withdrawals are skipped, so this is one list call
  // once the constructor cache is warm (after a restart, up to one datum
  // lookup per distinct redeemer on the page).
  if (page > 1) await indexContractPage({ ...params, page: page - 1 });
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
  try {
    await indexNetworkContracts(network);
  } catch (error) {
    logger.error('Error indexing network purchases', { error, network });
  }
}

async function indexNetworkContracts(network: $Enums.Network) {
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
