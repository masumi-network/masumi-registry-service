/*
  Warnings:

  - The values [None] on the enum `PricingType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PricingType_new" AS ENUM ('Fixed', 'Free');
ALTER TABLE "AgentPricing" ALTER COLUMN "pricingType" TYPE "PricingType_new" USING ("pricingType"::text::"PricingType_new");
ALTER TYPE "PricingType" RENAME TO "PricingType_old";
ALTER TYPE "PricingType_new" RENAME TO "PricingType";
DROP TYPE "PricingType_old";
COMMIT;
