/*
  Warnings:

  - Made the column `network` on table `RegistrySource` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "RegistrySource" ALTER COLUMN "network" SET NOT NULL;
