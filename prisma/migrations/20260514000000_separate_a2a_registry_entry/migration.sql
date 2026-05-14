-- Migration: separate A2A registry entries into their own table
-- Sandro's architectural requirement: MIP-002 entries must not share the
-- RegistryEntry table with MIP-001. Pattern mirrors InboxAgentRegistration.

BEGIN;

-- 1. Create the new A2ARegistryEntry table
CREATE TABLE "A2ARegistryEntry" (
    "id"                    TEXT NOT NULL,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    "name"                  TEXT NOT NULL,
    "apiBaseUrl"            TEXT NOT NULL,
    "description"           TEXT,
    "authorName"            TEXT,
    "authorContactEmail"    TEXT,
    "authorContactOther"    TEXT,
    "authorOrganization"    TEXT,
    "privacyPolicy"         TEXT,
    "termsAndCondition"     TEXT,
    "otherLegal"            TEXT,
    "image"                 TEXT,
    "tags"                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "agentCardUrl"          TEXT,
    "a2aProtocolVersions"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "a2aAgentVersion"       TEXT,
    "a2aDefaultInputModes"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "a2aDefaultOutputModes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "a2aProviderName"       TEXT,
    "a2aProviderUrl"        TEXT,
    "a2aDocumentationUrl"   TEXT,
    "a2aIconUrl"            TEXT,
    "lastUptimeCheck"       TIMESTAMP(3) NOT NULL,
    "uptimeCount"           INTEGER NOT NULL DEFAULT 0,
    "uptimeCheckCount"      INTEGER NOT NULL DEFAULT 0,
    "status"                "Status" NOT NULL,
    "statusUpdatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assetIdentifier"       TEXT NOT NULL,
    "metadataVersion"       INTEGER NOT NULL,
    "searchText"            TEXT NOT NULL DEFAULT '',
    "registrySourceId"      TEXT NOT NULL,

    CONSTRAINT "A2ARegistryEntry_pkey" PRIMARY KEY ("id")
);

-- 2. Unique constraint on assetIdentifier (same as RegistryEntry)
CREATE UNIQUE INDEX "A2ARegistryEntry_assetIdentifier_key" ON "A2ARegistryEntry"("assetIdentifier");

-- 3. Indexes matching the InboxAgentRegistration pattern
CREATE INDEX "A2ARegistryEntry_statusUpdatedAt_idx" ON "A2ARegistryEntry"("statusUpdatedAt");
CREATE INDEX "A2ARegistryEntry_statusUpdatedAt_id_idx" ON "A2ARegistryEntry"("statusUpdatedAt", "id");
CREATE INDEX "A2ARegistryEntry_registrySourceId_idx" ON "A2ARegistryEntry"("registrySourceId");
CREATE INDEX "A2ARegistryEntry_registrySourceId_status_updatedAt_idx" ON "A2ARegistryEntry"("registrySourceId", "status", "updatedAt");
CREATE INDEX "A2ARegistryEntry_status_idx" ON "A2ARegistryEntry"("status");

-- 4. Foreign key to RegistrySource
ALTER TABLE "A2ARegistryEntry"
    ADD CONSTRAINT "A2ARegistryEntry_registrySourceId_fkey"
    FOREIGN KEY ("registrySourceId")
    REFERENCES "RegistrySource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Migrate existing MIP-002 rows from RegistryEntry into A2ARegistryEntry
INSERT INTO "A2ARegistryEntry" (
    "id", "createdAt", "updatedAt",
    "name", "apiBaseUrl", "description",
    "authorName", "authorContactEmail", "authorContactOther", "authorOrganization",
    "privacyPolicy", "termsAndCondition", "otherLegal",
    "image", "tags",
    "agentCardUrl", "a2aProtocolVersions",
    "a2aAgentVersion", "a2aDefaultInputModes", "a2aDefaultOutputModes",
    "a2aProviderName", "a2aProviderUrl", "a2aDocumentationUrl", "a2aIconUrl",
    "lastUptimeCheck", "uptimeCount", "uptimeCheckCount",
    "status", "statusUpdatedAt",
    "assetIdentifier", "metadataVersion", "searchText",
    "registrySourceId"
)
SELECT
    "id", "createdAt", "updatedAt",
    "name", "apiBaseUrl", "description",
    "authorName", "authorContactEmail", "authorContactOther", "authorOrganization",
    "privacyPolicy", "termsAndCondition", "otherLegal",
    "image", "tags",
    "agentCardUrl", "a2aProtocolVersions",
    "a2aAgentVersion", "a2aDefaultInputModes", "a2aDefaultOutputModes",
    "a2aProviderName", "a2aProviderUrl", "a2aDocumentationUrl", "a2aIconUrl",
    "lastUptimeCheck", "uptimeCount", "uptimeCheckCount",
    "status", "statusUpdatedAt",
    "assetIdentifier", "metadataVersion", "searchText",
    "registrySourceId"
FROM "RegistryEntry"
WHERE "metadataVersion" = 2;

-- 6. Re-point A2ASkill FK: registryEntryId -> a2aRegistryEntryId on A2ARegistryEntry
--    (rows already exist, update their FK column values to match migrated IDs)
ALTER TABLE "A2ASkill"
    ADD COLUMN "a2aRegistryEntryId" TEXT;

UPDATE "A2ASkill" s
SET "a2aRegistryEntryId" = s."registryEntryId"
WHERE s."registryEntryId" IN (
    SELECT "id" FROM "RegistryEntry" WHERE "metadataVersion" = 2
);

-- Drop old FK constraint and column on A2ASkill
ALTER TABLE "A2ASkill"
    DROP CONSTRAINT "A2ASkill_registryEntryId_fkey";

ALTER TABLE "A2ASkill"
    DROP COLUMN "registryEntryId";

-- Add new NOT NULL constraint and FK on A2ASkill
ALTER TABLE "A2ASkill"
    ALTER COLUMN "a2aRegistryEntryId" SET NOT NULL;

ALTER TABLE "A2ASkill"
    ADD CONSTRAINT "A2ASkill_a2aRegistryEntryId_fkey"
    FOREIGN KEY ("a2aRegistryEntryId")
    REFERENCES "A2ARegistryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Re-point A2ASupportedInterface FK
ALTER TABLE "A2ASupportedInterface"
    ADD COLUMN "a2aRegistryEntryId" TEXT;

UPDATE "A2ASupportedInterface" i
SET "a2aRegistryEntryId" = i."registryEntryId"
WHERE i."registryEntryId" IN (
    SELECT "id" FROM "RegistryEntry" WHERE "metadataVersion" = 2
);

ALTER TABLE "A2ASupportedInterface"
    DROP CONSTRAINT "A2ASupportedInterface_registryEntryId_fkey";

ALTER TABLE "A2ASupportedInterface"
    DROP COLUMN "registryEntryId";

ALTER TABLE "A2ASupportedInterface"
    ALTER COLUMN "a2aRegistryEntryId" SET NOT NULL;

ALTER TABLE "A2ASupportedInterface"
    ADD CONSTRAINT "A2ASupportedInterface_a2aRegistryEntryId_fkey"
    FOREIGN KEY ("a2aRegistryEntryId")
    REFERENCES "A2ARegistryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Re-point A2ACapabilities FK
ALTER TABLE "A2ACapabilities"
    ADD COLUMN "a2aRegistryEntryId" TEXT;

UPDATE "A2ACapabilities" c
SET "a2aRegistryEntryId" = c."registryEntryId"
WHERE c."registryEntryId" IN (
    SELECT "id" FROM "RegistryEntry" WHERE "metadataVersion" = 2
);

ALTER TABLE "A2ACapabilities"
    DROP CONSTRAINT "A2ACapabilities_registryEntryId_fkey";

ALTER TABLE "A2ACapabilities"
    DROP COLUMN "registryEntryId";

ALTER TABLE "A2ACapabilities"
    ALTER COLUMN "a2aRegistryEntryId" SET NOT NULL;

ALTER TABLE "A2ACapabilities"
    ADD CONSTRAINT "A2ACapabilities_a2aRegistryEntryId_fkey"
    FOREIGN KEY ("a2aRegistryEntryId")
    REFERENCES "A2ARegistryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique index on A2ACapabilities.a2aRegistryEntryId (one per A2A entry)
CREATE UNIQUE INDEX "A2ACapabilities_a2aRegistryEntryId_key"
    ON "A2ACapabilities"("a2aRegistryEntryId");

-- 9. Delete MIP-002 rows from RegistryEntry (they are now in A2ARegistryEntry)
DELETE FROM "RegistryEntry" WHERE "metadataVersion" = 2;

-- 10. Drop A2A columns from RegistryEntry
ALTER TABLE "RegistryEntry"
    DROP COLUMN IF EXISTS "agentCardUrl",
    DROP COLUMN IF EXISTS "a2aProtocolVersions",
    DROP COLUMN IF EXISTS "a2aAgentVersion",
    DROP COLUMN IF EXISTS "a2aDefaultInputModes",
    DROP COLUMN IF EXISTS "a2aDefaultOutputModes",
    DROP COLUMN IF EXISTS "a2aProviderName",
    DROP COLUMN IF EXISTS "a2aProviderUrl",
    DROP COLUMN IF EXISTS "a2aDocumentationUrl",
    DROP COLUMN IF EXISTS "a2aIconUrl";

COMMIT;
