/*
  Warnings:

  - The values [Offchain] on the enum `PaymentType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentType_new" AS ENUM ('Web3CardanoV1', 'None');
ALTER TABLE "RegistryEntry" ALTER COLUMN "paymentType" DROP DEFAULT;
ALTER TABLE "RegistryEntry" ALTER COLUMN "paymentType" TYPE "PaymentType_new" USING ("paymentType"::text::"PaymentType_new");
ALTER TYPE "PaymentType" RENAME TO "PaymentType_old";
ALTER TYPE "PaymentType_new" RENAME TO "PaymentType";
DROP TYPE "PaymentType_old";
ALTER TABLE "RegistryEntry" ALTER COLUMN "paymentType" SET DEFAULT 'Web3CardanoV1';
COMMIT;
