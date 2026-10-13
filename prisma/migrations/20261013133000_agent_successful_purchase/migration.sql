-- Successful-purchase history for ranking (MAS-607 slice 2), indexed from the
-- payment smart contracts on chain: one row per seller withdrawal with block
-- time, buyer and paid amounts per asset. The first indexer run is the
-- backfill; its per-contract cursor makes it resumable.

-- CreateTable
CREATE TABLE "AgentSuccessfulPurchase" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "network" "Network" NOT NULL,
    "txHash" TEXT NOT NULL,
    "redeemerIndex" INTEGER NOT NULL,
    "agentIdentifier" TEXT,
    "buyerKeyHash" TEXT,
    "blockTime" TIMESTAMP(3),

    CONSTRAINT "AgentSuccessfulPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPurchaseAmount" (
    "id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "purchaseId" TEXT NOT NULL,

    CONSTRAINT "AgentPurchaseAmount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentContractSyncState" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "network" "Network" NOT NULL,
    "scriptHash" TEXT NOT NULL,
    "lastCheckedPage" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PaymentContractSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSuccessfulPurchase_network_agentIdentifier_blockTime_idx" ON "AgentSuccessfulPurchase"("network", "agentIdentifier", "blockTime");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSuccessfulPurchase_network_txHash_redeemerIndex_key" ON "AgentSuccessfulPurchase"("network", "txHash", "redeemerIndex");

-- CreateIndex
CREATE INDEX "AgentPurchaseAmount_purchaseId_idx" ON "AgentPurchaseAmount"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentContractSyncState_network_scriptHash_key" ON "PaymentContractSyncState"("network", "scriptHash");

-- AddForeignKey
ALTER TABLE "AgentPurchaseAmount" ADD CONSTRAINT "AgentPurchaseAmount_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "AgentSuccessfulPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

