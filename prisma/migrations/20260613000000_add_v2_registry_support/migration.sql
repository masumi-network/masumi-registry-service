-- AlterEnum: the V2 registry payment type.
ALTER TYPE "PaymentType" ADD VALUE 'Web3CardanoV2';

-- CreateTable: read model for the V2 metadata `supported_payment_sources`.
-- Cardano rows carry paymentSourceType + address; x402/EVM rows carry
-- scheme/asset/amount/decimals/payTo. Re-synced from chain, never minted here.
CREATE TABLE "SupportedPaymentSource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chain" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "paymentSourceType" TEXT,
    "address" TEXT NOT NULL,
    "scheme" TEXT,
    "asset" TEXT,
    "amount" BIGINT,
    "decimals" INTEGER,
    "payTo" TEXT,
    "resource" TEXT,
    "extra" JSONB,
    "registryEntryId" TEXT NOT NULL,
    CONSTRAINT "SupportedPaymentSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable: read model for the V2 metadata `verifications`.
CREATE TABLE "AgentVerification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "schemaVersion" TEXT,
    "issuerAid" TEXT NOT NULL,
    "issuerOobi" TEXT NOT NULL,
    "schemaSaid" TEXT NOT NULL,
    "schemaOobi" TEXT NOT NULL,
    "credentialSaid" TEXT NOT NULL,
    "credentialOobi" TEXT NOT NULL,
    "credentialRegistry" TEXT,
    "holderAid" TEXT NOT NULL,
    "holderOobi" TEXT NOT NULL,
    "baseUrl" TEXT,
    "registryEntryId" TEXT NOT NULL,
    CONSTRAINT "AgentVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportedPaymentSource_registryEntryId_idx" ON "SupportedPaymentSource"("registryEntryId");
CREATE INDEX "AgentVerification_registryEntryId_idx" ON "AgentVerification"("registryEntryId");

-- AddForeignKey
ALTER TABLE "SupportedPaymentSource" ADD CONSTRAINT "SupportedPaymentSource_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentVerification" ADD CONSTRAINT "AgentVerification_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
