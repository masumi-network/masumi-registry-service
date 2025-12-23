/*
  Warnings:

  - Made the column `statusUpdatedAt` on table `RegistryEntry` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill any existing nulls with the current timestamp so the NOT NULL
-- constraint can be applied safely.
UPDATE "RegistryEntry"
SET "statusUpdatedAt" = NOW()
WHERE "statusUpdatedAt" IS NULL;

-- AlterTable
ALTER TABLE "RegistryEntry"
ALTER COLUMN "statusUpdatedAt" SET NOT NULL,
ALTER COLUMN "statusUpdatedAt" SET DEFAULT CURRENT_TIMESTAMP;
