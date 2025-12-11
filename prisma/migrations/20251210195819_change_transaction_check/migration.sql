/*
  Warnings:

  - You are about to drop the column `latestIdentifier` on the `RegistrySource` table. All the data in the column will be lost.
  - You are about to drop the column `latestPage` on the `RegistrySource` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RegistrySource" DROP COLUMN "latestIdentifier",
DROP COLUMN "latestPage",
ADD COLUMN     "lastCheckedPage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastTxId" TEXT;
