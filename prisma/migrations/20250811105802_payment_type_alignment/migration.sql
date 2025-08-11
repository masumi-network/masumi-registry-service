/*
  Warnings:

  - You are about to drop the `PaymentIdentifier` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PaymentIdentifier" DROP CONSTRAINT "PaymentIdentifier_registryEntryId_fkey";

-- AlterTable
ALTER TABLE "RegistryEntry" ADD COLUMN     "paymentType" "PaymentType" NOT NULL DEFAULT 'Web3CardanoV1';

-- DropTable
DROP TABLE "PaymentIdentifier";
