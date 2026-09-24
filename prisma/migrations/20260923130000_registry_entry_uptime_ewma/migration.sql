-- Rolling uptime for ranking (MAS-607 slice 2): an exponentially weighted
-- moving average of health checks, updated alongside uptimeCount.

-- AlterTable
ALTER TABLE "RegistryEntry" ADD COLUMN "uptimeEwma" DOUBLE PRECISION;

-- Seed existing entries from their lifetime ratio so ranking has a starting
-- value; never-checked entries stay NULL until their first health check.
UPDATE "RegistryEntry"
SET "uptimeEwma" = "uptimeCount"::DOUBLE PRECISION / "uptimeCheckCount"
WHERE "uptimeCheckCount" > 0;
