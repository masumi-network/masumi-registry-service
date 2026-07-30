-- CreateEnum
CREATE TYPE "RegistryEntryType" AS ENUM ('Standard', 'OpenApi', 'X402');

-- AlterTable
-- `type` gets a NOT NULL DEFAULT so every pre-existing indexed row is backfilled
-- to Standard in place (matches "absent on-chain type resolves to Standard").
-- `apiBaseUrl` becomes nullable because OpenApi/X402 entries advertise
-- openApiSpecUrl / x402ResourcesUrl instead of a base URL.
ALTER TABLE "RegistryEntry"
  ADD COLUMN "type" "RegistryEntryType" NOT NULL DEFAULT 'Standard',
  ADD COLUMN "openApiSpecUrl" TEXT,
  ADD COLUMN "x402ResourcesUrl" TEXT,
  ALTER COLUMN "apiBaseUrl" DROP NOT NULL;
