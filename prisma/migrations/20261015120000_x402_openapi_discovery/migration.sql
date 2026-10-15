-- Where an X402 agent's own origins publish an OpenAPI document (MAS-453).
-- Derived, informational data; rebuilt from the live origins.

-- CreateEnum
CREATE TYPE "X402OpenApiDiscoveryOutcome" AS ENUM ('Found', 'NotFound', 'Invalid', 'Unreachable');

-- CreateTable
CREATE TABLE "X402OpenApiDiscovery" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "origin" TEXT NOT NULL,
    "outcome" "X402OpenApiDiscoveryOutcome" NOT NULL,
    "specUrl" TEXT,
    "openApiVersion" TEXT,
    "title" TEXT,
    "spec" JSONB,
    "reason" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "registryEntryId" TEXT NOT NULL,

    CONSTRAINT "X402OpenApiDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "X402OpenApiDiscovery_registryEntryId_origin_key" ON "X402OpenApiDiscovery"("registryEntryId", "origin");

-- CreateIndex
CREATE INDEX "X402OpenApiDiscovery_registryEntryId_checkedAt_idx" ON "X402OpenApiDiscovery"("registryEntryId", "checkedAt");

-- AddForeignKey
ALTER TABLE "X402OpenApiDiscovery" ADD CONSTRAINT "X402OpenApiDiscovery_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
