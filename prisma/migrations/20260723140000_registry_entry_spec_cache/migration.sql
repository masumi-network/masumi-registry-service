-- AlterTable
-- Cache the last fetched + validated spec snapshot so GET
-- /registry-entry/{id}/spec serves a known-good copy independent of the agent's
-- live availability. Both are populated/refreshed by the periodic health loop.
ALTER TABLE "RegistryEntry"
  ADD COLUMN "spec" JSONB,
  ADD COLUMN "specValidatedAt" TIMESTAMP(3);
