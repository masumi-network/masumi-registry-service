-- Successful-purchase counters for ranking (MAS-607 slice 2), indexed from the
-- payment smart contracts on chain. The first indexer run is the backfill; its
-- per-contract cursor makes it resumable.

-- CreateTable
CREATE TABLE "AgentSuccessfulPurchase" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "network" "Network" NOT NULL,
    "agentIdentifier" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "redeemerIndex" INTEGER NOT NULL,

    CONSTRAINT "AgentSuccessfulPurchase_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "AgentSuccessfulPurchase_network_agentIdentifier_idx" ON "AgentSuccessfulPurchase"("network", "agentIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSuccessfulPurchase_network_txHash_redeemerIndex_key" ON "AgentSuccessfulPurchase"("network", "txHash", "redeemerIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentContractSyncState_network_scriptHash_key" ON "PaymentContractSyncState"("network", "scriptHash");
