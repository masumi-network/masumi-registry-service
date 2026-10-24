-- What an X402 agent's own resource endpoints answer to an unpaid request
-- (MAS-455). Derived, informational data; rebuilt from the live endpoints.

-- CreateEnum
CREATE TYPE "X402ProbeOutcome" AS ENUM ('Payable', 'Free', 'Invalid', 'Unsupported', 'Unreachable');

-- CreateTable
CREATE TABLE "X402ResourceProbe" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resource" TEXT NOT NULL,
    "outcome" "X402ProbeOutcome" NOT NULL,
    "httpStatus" INTEGER,
    "x402Version" INTEGER,
    "accepts" JSONB,
    "matchesRegisteredSources" BOOLEAN,
    "mismatches" TEXT[],
    "reason" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "registryEntryId" TEXT NOT NULL,

    CONSTRAINT "X402ResourceProbe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "X402ResourceProbe_registryEntryId_resource_key" ON "X402ResourceProbe"("registryEntryId", "resource");

-- CreateIndex
CREATE INDEX "X402ResourceProbe_registryEntryId_checkedAt_idx" ON "X402ResourceProbe"("registryEntryId", "checkedAt");

-- AddForeignKey
ALTER TABLE "X402ResourceProbe" ADD CONSTRAINT "X402ResourceProbe_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
