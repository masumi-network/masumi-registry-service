WITH ranked_sources AS (
    SELECT
        "id",
        "network",
        "policyId",
        ROW_NUMBER() OVER (
            PARTITION BY "network", "policyId"
            ORDER BY
                CASE WHEN "type" = 'Web3CardanoV1' THEN 0 ELSE 1 END,
                "createdAt" ASC,
                "id" ASC
        ) AS rank,
        FIRST_VALUE("id") OVER (
            PARTITION BY "network", "policyId"
            ORDER BY
                CASE WHEN "type" = 'Web3CardanoV1' THEN 0 ELSE 1 END,
                "createdAt" ASC,
                "id" ASC
        ) AS keep_id
    FROM "RegistrySource"
),
sources_to_merge AS (
    SELECT "id", keep_id
    FROM ranked_sources
    WHERE rank > 1
)
UPDATE "RegistryEntry" AS re
SET "registrySourceId" = stm.keep_id
FROM sources_to_merge AS stm
WHERE re."registrySourceId" = stm."id";

WITH ranked_sources AS (
    SELECT
        "id",
        "network",
        "policyId",
        ROW_NUMBER() OVER (
            PARTITION BY "network", "policyId"
            ORDER BY
                CASE WHEN "type" = 'Web3CardanoV1' THEN 0 ELSE 1 END,
                "createdAt" ASC,
                "id" ASC
        ) AS rank,
        FIRST_VALUE("id") OVER (
            PARTITION BY "network", "policyId"
            ORDER BY
                CASE WHEN "type" = 'Web3CardanoV1' THEN 0 ELSE 1 END,
                "createdAt" ASC,
                "id" ASC
        ) AS keep_id
    FROM "RegistrySource"
),
sources_to_merge AS (
    SELECT "id", keep_id
    FROM ranked_sources
    WHERE rank > 1
)
UPDATE "InboxAgentRegistration" AS iar
SET "registrySourceId" = stm.keep_id
FROM sources_to_merge AS stm
WHERE iar."registrySourceId" = stm."id";

WITH ranked_sources AS (
    SELECT
        "id",
        "network",
        "policyId",
        ROW_NUMBER() OVER (
            PARTITION BY "network", "policyId"
            ORDER BY
                CASE WHEN "type" = 'Web3CardanoV1' THEN 0 ELSE 1 END,
                "createdAt" ASC,
                "id" ASC
        ) AS rank
    FROM "RegistrySource"
)
DELETE FROM "RegistrySource" AS rs
USING ranked_sources AS ranked
WHERE rs."id" = ranked."id"
  AND ranked.rank > 1;

DROP INDEX IF EXISTS "RegistrySource_type_policyId_key";

ALTER TABLE "RegistrySource"
DROP COLUMN "type";

DROP TYPE IF EXISTS "RegistryEntryType";

CREATE UNIQUE INDEX "RegistrySource_network_policyId_key"
ON "RegistrySource"("network", "policyId");
