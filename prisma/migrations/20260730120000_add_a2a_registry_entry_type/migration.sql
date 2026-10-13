-- AlterEnum
-- Fourth agent access model (MIP-002-A2A). On-chain `type` string is "a2aV1";
-- absent/unrecognised values keep resolving to Standard, so older indexers and
-- pre-existing rows are unaffected. Adding a value (without using it in the same
-- transaction) is safe inside Postgres' migration transaction.
ALTER TYPE "RegistryEntryType" ADD VALUE 'A2A';

-- CreateTable
-- A2A-specific descriptor lives in its own 1:1 table rather than as columns on
-- RegistryEntry, so each access model's type-specific fields do not accumulate
-- as sparse NULL columns on the shared row. The Agent Card document itself is
-- cached whole in RegistryEntry.spec, so nothing from the card is exploded here.
CREATE TABLE "A2ARegistryEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agentCardUrl" TEXT NOT NULL,
    "protocolVersions" TEXT[],
    "registryEntryId" TEXT NOT NULL,

    CONSTRAINT "A2ARegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "A2ARegistryEntry_registryEntryId_key" ON "A2ARegistryEntry"("registryEntryId");

-- AddForeignKey
-- Cascade so deregistering/removing an entry cleans up its descriptor, matching
-- SupportedPaymentSource and AgentVerification.
ALTER TABLE "A2ARegistryEntry" ADD CONSTRAINT "A2ARegistryEntry_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
