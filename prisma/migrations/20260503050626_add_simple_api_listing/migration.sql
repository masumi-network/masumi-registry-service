-- CreateEnum
CREATE TYPE "SimpleApiStatus" AS ENUM ('Online', 'Offline', 'Invalid', 'Deregistered');

-- DropIndex
DROP INDEX "public"."InboxAgentRegistration_agentSlug_trgm_idx";

-- DropIndex
DROP INDEX "public"."InboxAgentRegistration_linkedEmail_trgm_idx";

-- DropIndex
DROP INDEX "public"."InboxAgentRegistration_name_trgm_idx";

-- DropIndex
DROP INDEX "public"."RegistryEntry_searchText_trgm_idx";

-- CreateTable
CREATE TABLE "SimpleApiListing" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "network" "Network" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[],
    "scheme" TEXT,
    "x402Network" TEXT,
    "maxAmountRequired" BIGINT,
    "payTo" TEXT,
    "asset" TEXT,
    "resource" TEXT,
    "mimeType" TEXT,
    "httpMethod" TEXT,
    "rawAccepts" JSONB,
    "extra" JSONB,
    "status" "SimpleApiStatus" NOT NULL DEFAULT 'Offline',
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),
    "lastValidationError" TEXT,
    "submittedByApiKeyId" TEXT,

    CONSTRAINT "SimpleApiListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimpleApiListing_urlHash_key" ON "SimpleApiListing"("urlHash");

-- CreateIndex
CREATE INDEX "SimpleApiListing_network_status_idx" ON "SimpleApiListing"("network", "status");

-- CreateIndex
CREATE INDEX "SimpleApiListing_statusUpdatedAt_id_idx" ON "SimpleApiListing"("statusUpdatedAt", "id");

-- CreateIndex
CREATE INDEX "SimpleApiListing_network_category_idx" ON "SimpleApiListing"("network", "category");

-- CreateIndex
CREATE INDEX "SimpleApiListing_network_statusUpdatedAt_idx" ON "SimpleApiListing"("network", "statusUpdatedAt");
