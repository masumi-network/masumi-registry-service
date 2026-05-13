CREATE TYPE "InboxAgentRegistrationStatus" AS ENUM (
    'Pending',
    'Verified',
    'Invalid',
    'Deregistered'
);

CREATE TABLE "InboxAgentRegistration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "InboxAgentRegistrationStatus" NOT NULL DEFAULT 'Pending',
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentSlug" TEXT NOT NULL,
    "assetIdentifier" TEXT NOT NULL,
    "metadataVersion" INTEGER NOT NULL,
    "registrySourceId" TEXT NOT NULL,

    CONSTRAINT "InboxAgentRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxAgentRegistration_assetIdentifier_key"
ON "InboxAgentRegistration"("assetIdentifier");

CREATE INDEX "InboxAgentRegistration_agentSlug_idx"
ON "InboxAgentRegistration"("agentSlug");

CREATE INDEX "InboxAgentRegistration_status_idx"
ON "InboxAgentRegistration"("status");

CREATE INDEX "InboxAgentRegistration_statusUpdatedAt_idx"
ON "InboxAgentRegistration"("statusUpdatedAt");

CREATE INDEX "InboxAgentRegistration_statusUpdatedAt_id_idx"
ON "InboxAgentRegistration"("statusUpdatedAt", "id");

ALTER TABLE "InboxAgentRegistration"
ADD CONSTRAINT "InboxAgentRegistration_registrySourceId_fkey"
FOREIGN KEY ("registrySourceId") REFERENCES "RegistrySource"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

DROP TRIGGER IF EXISTS trg_set_inbox_agent_registration_status_updated_at_insert
ON "InboxAgentRegistration";

DROP TRIGGER IF EXISTS trg_set_inbox_agent_registration_status_updated_at
ON "InboxAgentRegistration";

CREATE TRIGGER trg_set_inbox_agent_registration_status_updated_at_insert
BEFORE INSERT ON "InboxAgentRegistration"
FOR EACH ROW
EXECUTE FUNCTION set_status_updated_at();

CREATE TRIGGER trg_set_inbox_agent_registration_status_updated_at
BEFORE UPDATE ON "InboxAgentRegistration"
FOR EACH ROW
EXECUTE FUNCTION set_status_updated_at();
