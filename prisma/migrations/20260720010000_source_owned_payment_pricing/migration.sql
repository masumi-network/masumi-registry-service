-- V1 retains RegistryEntry-owned AgentPricing. V2 stores one complete pricing
-- relation per SupportedPaymentSource so independently priced Cardano and EVM
-- options survive indexing without being projected into a shared value.

ALTER TABLE "AgentPricing"
ADD COLUMN "registryEntryId" TEXT,
ADD COLUMN "supportedPaymentSourceId" TEXT;

ALTER TABLE "AgentFixedPricing"
ADD COLUMN "agentPricingId" TEXT;

ALTER TABLE "SupportedPaymentSource"
ADD COLUMN "sourceIndex" INTEGER,
ADD COLUMN "dynamicAsset" TEXT,
ADD COLUMN "dynamicDecimals" INTEGER,
ADD COLUMN "fixedDecimals" INTEGER;

UPDATE "AgentPricing" AS pricing
SET "registryEntryId" = entry."id"
FROM "RegistryEntry" AS entry
WHERE entry."agentPricingId" = pricing."id";

UPDATE "AgentFixedPricing" AS fixed
SET "agentPricingId" = pricing."id"
FROM "AgentPricing" AS pricing
WHERE pricing."agentFixedPricingId" = fixed."id";

INSERT INTO "AgentPricing" (
  "id",
  "createdAt",
  "updatedAt",
  "pricingType",
  "supportedPaymentSourceId"
)
SELECT
  'source-pricing-' || source."id",
  source."createdAt",
  source."updatedAt",
  CASE
    WHEN source."chain" = 'EVM' THEN COALESCE(source."pricingType", 'Fixed'::"PricingType")
    ELSE entry_pricing."pricingType"
  END,
  source."id"
FROM "SupportedPaymentSource" AS source
JOIN "RegistryEntry" AS entry ON entry."id" = source."registryEntryId"
JOIN "AgentPricing" AS entry_pricing ON entry_pricing."registryEntryId" = entry."id";

INSERT INTO "AgentFixedPricing" (
  "id",
  "createdAt",
  "updatedAt",
  "agentPricingId"
)
SELECT
  'source-fixed-' || source."id",
  source."createdAt",
  source."updatedAt",
  'source-pricing-' || source."id"
FROM "SupportedPaymentSource" AS source
JOIN "AgentPricing" AS source_pricing
  ON source_pricing."supportedPaymentSourceId" = source."id"
WHERE source_pricing."pricingType" = 'Fixed';

INSERT INTO "UnitValue" (
  "id",
  "createdAt",
  "updatedAt",
  "unit",
  "amount",
  "agentFixedPricingId"
)
SELECT
  'source-amount-' || source."id",
  source."createdAt",
  source."updatedAt",
  source."asset",
  source."amount",
  'source-fixed-' || source."id"
FROM "SupportedPaymentSource" AS source
JOIN "AgentPricing" AS source_pricing
  ON source_pricing."supportedPaymentSourceId" = source."id"
WHERE source."chain" = 'EVM'
  AND source_pricing."pricingType" = 'Fixed'
  AND source."asset" IS NOT NULL
  AND source."amount" IS NOT NULL;

INSERT INTO "UnitValue" (
  "id",
  "createdAt",
  "updatedAt",
  "unit",
  "amount",
  "agentFixedPricingId"
)
SELECT
  'source-amount-' || source."id" || '-' || amount."id",
  amount."createdAt",
  amount."updatedAt",
  amount."unit",
  amount."amount",
  'source-fixed-' || source."id"
FROM "SupportedPaymentSource" AS source
JOIN "RegistryEntry" AS entry ON entry."id" = source."registryEntryId"
JOIN "AgentPricing" AS entry_pricing ON entry_pricing."registryEntryId" = entry."id"
JOIN "AgentFixedPricing" AS entry_fixed ON entry_fixed."agentPricingId" = entry_pricing."id"
JOIN "UnitValue" AS amount ON amount."agentFixedPricingId" = entry_fixed."id"
WHERE source."chain" = 'Cardano'
  AND entry_pricing."pricingType" = 'Fixed';

WITH ranked_sources AS (
  SELECT
    "id",
    (
      ROW_NUMBER() OVER (
      PARTITION BY "registryEntryId"
      ORDER BY "createdAt", "id"
      ) - 1
    )::INTEGER AS "sourceIndex"
  FROM "SupportedPaymentSource"
)
UPDATE "SupportedPaymentSource" AS source
SET
  "sourceIndex" = ranked."sourceIndex",
  "dynamicAsset" = CASE
    WHEN source."chain" = 'EVM' AND source."pricingType" = 'Dynamic'
      THEN LOWER(source."asset")
    ELSE NULL
  END,
  "dynamicDecimals" = CASE
    WHEN source."chain" = 'EVM' AND source."pricingType" = 'Dynamic'
      THEN source."decimals"
    ELSE NULL
  END,
  "fixedDecimals" = CASE
    WHEN source."chain" = 'EVM' AND source."pricingType" = 'Fixed'
      THEN source."decimals"
    ELSE NULL
  END
FROM ranked_sources AS ranked
WHERE source."id" = ranked."id";

DELETE FROM "UnitValue"
WHERE "agentFixedPricingId" IN (
  SELECT "id" FROM "AgentFixedPricing" WHERE "agentPricingId" IS NULL
);
DELETE FROM "AgentFixedPricing" WHERE "agentPricingId" IS NULL;

ALTER TABLE "RegistryEntry"
DROP CONSTRAINT IF EXISTS "RegistryEntry_agentPricingId_fkey";
ALTER TABLE "AgentPricing"
DROP CONSTRAINT IF EXISTS "AgentPricing_agentFixedPricingId_fkey";
ALTER TABLE "UnitValue"
DROP CONSTRAINT IF EXISTS "UnitValue_agentFixedPricingId_fkey";

DROP INDEX IF EXISTS "AgentPricing_agentFixedPricingId_key";

ALTER TABLE "RegistryEntry" DROP COLUMN "agentPricingId";
ALTER TABLE "AgentPricing" DROP COLUMN "agentFixedPricingId";
ALTER TABLE "AgentFixedPricing" ALTER COLUMN "agentPricingId" SET NOT NULL;
ALTER TABLE "UnitValue" ALTER COLUMN "agentFixedPricingId" SET NOT NULL;
ALTER TABLE "SupportedPaymentSource" ALTER COLUMN "sourceIndex" SET NOT NULL;

CREATE UNIQUE INDEX "AgentPricing_registryEntryId_key"
ON "AgentPricing"("registryEntryId");
CREATE UNIQUE INDEX "AgentPricing_supportedPaymentSourceId_key"
ON "AgentPricing"("supportedPaymentSourceId");
CREATE UNIQUE INDEX "AgentFixedPricing_agentPricingId_key"
ON "AgentFixedPricing"("agentPricingId");
CREATE UNIQUE INDEX "SupportedPaymentSource_registryEntryId_sourceIndex_key"
ON "SupportedPaymentSource"("registryEntryId", "sourceIndex");

ALTER TABLE "AgentPricing"
ADD CONSTRAINT "AgentPricing_registryEntryId_fkey"
FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentPricing"
ADD CONSTRAINT "AgentPricing_supportedPaymentSourceId_fkey"
FOREIGN KEY ("supportedPaymentSourceId") REFERENCES "SupportedPaymentSource"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentFixedPricing"
ADD CONSTRAINT "AgentFixedPricing_agentPricingId_fkey"
FOREIGN KEY ("agentPricingId") REFERENCES "AgentPricing"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitValue"
ADD CONSTRAINT "UnitValue_agentFixedPricingId_fkey"
FOREIGN KEY ("agentFixedPricingId") REFERENCES "AgentFixedPricing"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM "AgentPricing"
WHERE "registryEntryId" IN (
  SELECT "id" FROM "RegistryEntry" WHERE "metadataVersion" >= 2
);

DELETE FROM "SupportedPaymentSource"
WHERE "registryEntryId" IN (
  SELECT "id" FROM "RegistryEntry" WHERE "metadataVersion" < 2
);

DELETE FROM "AgentPricing"
WHERE "registryEntryId" IS NULL
  AND "supportedPaymentSourceId" IS NULL;

ALTER TABLE "AgentPricing"
ADD CONSTRAINT "AgentPricing_exactly_one_owner_check" CHECK (
  num_nonnulls("registryEntryId", "supportedPaymentSourceId") = 1
);

ALTER TABLE "SupportedPaymentSource"
DROP COLUMN "pricingType",
DROP COLUMN "asset",
DROP COLUMN "amount",
DROP COLUMN "decimals";

ALTER TABLE "SupportedPaymentSource"
ADD CONSTRAINT "SupportedPaymentSource_completeness_check" CHECK (
  (
    "chain" = 'Cardano'
    AND "paymentSourceType" IS NOT NULL
    AND "scheme" IS NULL
    AND "payTo" IS NULL
    AND "dynamicAsset" IS NULL
    AND "dynamicDecimals" IS NULL
    AND "fixedDecimals" IS NULL
  )
  OR (
    "chain" = 'EVM'
    AND "paymentSourceType" IS NULL
    AND "scheme" IS NOT NULL
    AND "payTo" IS NOT NULL
    AND (
      ("dynamicAsset" IS NULL AND "dynamicDecimals" IS NULL)
      OR ("dynamicAsset" IS NOT NULL AND "dynamicDecimals" IS NOT NULL)
    )
  )
);

UPDATE "RegistryEntry" AS entry
SET
  "status" = 'Invalid',
  "statusUpdatedAt" = CURRENT_TIMESTAMP
WHERE entry."metadataVersion" >= 2
  AND NOT EXISTS (
    SELECT 1
    FROM "SupportedPaymentSource" AS source
    WHERE source."registryEntryId" = entry."id"
  );

-- The old flattened read model did not preserve source array order and stored
-- only one projected Cardano price. Force a one-time authoritative chain
-- replay for every source containing V2 entries so sourceIndex and independent
-- pricing are reconstructed exactly from the on-chain metadata.
UPDATE "RegistrySource"
SET
  "lastTxId" = NULL,
  "lastCheckedPage" = 1
WHERE "id" IN (
  SELECT DISTINCT "registrySourceId"
  FROM "RegistryEntry"
  WHERE "metadataVersion" >= 2
);
