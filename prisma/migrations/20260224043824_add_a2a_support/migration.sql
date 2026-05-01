-- Make image nullable (MIP-002 has optional image)
ALTER TABLE "RegistryEntry" ALTER COLUMN "image" DROP NOT NULL;

-- Add new scalar fields to RegistryEntry for MIP-002
ALTER TABLE "RegistryEntry" ADD COLUMN "agentCardUrl" TEXT;
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aProtocolVersions" TEXT[] NOT NULL DEFAULT '{}';

-- Add A2A agent card detail fields (from off-chain Agent Card)
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aAgentVersion" TEXT;
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aDefaultInputModes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aDefaultOutputModes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aProviderName" TEXT;
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aProviderUrl" TEXT;
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aDocumentationUrl" TEXT;
ALTER TABLE "RegistryEntry" ADD COLUMN "a2aIconUrl" TEXT;

-- CreateTable A2ASkill
CREATE TABLE "A2ASkill" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "skillId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "examples" TEXT[] NOT NULL DEFAULT '{}',
    "inputModes" TEXT[] NOT NULL DEFAULT '{}',
    "outputModes" TEXT[] NOT NULL DEFAULT '{}',
    "registryEntryId" TEXT NOT NULL,

    CONSTRAINT "A2ASkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable A2ASupportedInterface
CREATE TABLE "A2ASupportedInterface" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "protocolBinding" TEXT NOT NULL,
    "protocolVersion" TEXT NOT NULL,
    "registryEntryId" TEXT NOT NULL,

    CONSTRAINT "A2ASupportedInterface_pkey" PRIMARY KEY ("id")
);

-- CreateTable A2ACapabilities
CREATE TABLE "A2ACapabilities" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "streaming" BOOLEAN,
    "pushNotifications" BOOLEAN,
    "extensions" JSONB,
    "registryEntryId" TEXT NOT NULL,

    CONSTRAINT "A2ACapabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex unique for 1:1 A2ACapabilities <-> RegistryEntry
CREATE UNIQUE INDEX "A2ACapabilities_registryEntryId_key" ON "A2ACapabilities"("registryEntryId");

-- AddForeignKey A2ASkill -> RegistryEntry (CASCADE)
ALTER TABLE "A2ASkill" ADD CONSTRAINT "A2ASkill_registryEntryId_fkey"
    FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey A2ASupportedInterface -> RegistryEntry (CASCADE)
ALTER TABLE "A2ASupportedInterface" ADD CONSTRAINT "A2ASupportedInterface_registryEntryId_fkey"
    FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey A2ACapabilities -> RegistryEntry (CASCADE)
ALTER TABLE "A2ACapabilities" ADD CONSTRAINT "A2ACapabilities_registryEntryId_fkey"
    FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
