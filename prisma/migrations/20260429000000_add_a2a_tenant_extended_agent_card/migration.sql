-- AlterTable: add tenant to A2ASupportedInterface (nullable, additive)
ALTER TABLE "A2ASupportedInterface" ADD COLUMN "tenant" TEXT;

-- AlterTable: add extendedAgentCard to A2ACapabilities (nullable, additive)
ALTER TABLE "A2ACapabilities" ADD COLUMN "extendedAgentCard" BOOLEAN;
