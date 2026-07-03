-- Repoint the V2 registry source(s) to the new minting policy and wipe every
-- agent indexed under the old policy so they re-sync from the new contract.
--
-- The V2 registry validator was recompiled with Aiken v1.1.23 (CIP-30 admin
-- signature upgrade in masumi-payment-service, see
-- docs/migrations/v2-contract-cip30-upgrade.md). The compiler bump changes the
-- compiled script hash, so the registry policy id changes even though the
-- validator logic is unchanged:
--   old: 7890b485b808043ef80136a447a3a43c18893a309dc323d1f8b0a13d
--   new: 67ab0c92c4ac1610895a1c965ee50aba41a8f1513b15240723b3bd0b
--
-- Assets minted under the old policy are stale for this indexer; agents must be
-- re-registered under the new policy, so we drop the old V2 entries here. V1
-- sources and shared Capability rows are untouched. Safe no-op when no V2 source
-- exists yet (e.g. a fresh database migrated before seeding).

-- 1. Capture the entries minted under the OLD V2 policy plus their 1:1 pricing
--    rows, before any deletes remove the links we need to follow.
CREATE TEMP TABLE _v2_wipe_entries AS
SELECT re."id" AS entry_id, re."agentPricingId" AS pricing_id
FROM "RegistryEntry" re
JOIN "RegistrySource" rs ON re."registrySourceId" = rs."id"
WHERE rs."policyId" = '7890b485b808043ef80136a447a3a43c18893a309dc323d1f8b0a13d';

CREATE TEMP TABLE _v2_wipe_fixed AS
SELECT ap."agentFixedPricingId" AS fixed_id
FROM "AgentPricing" ap
WHERE ap."id" IN (SELECT pricing_id FROM _v2_wipe_entries)
  AND ap."agentFixedPricingId" IS NOT NULL;

-- 2. Delete rows whose FK to a wiped row is SET NULL (would otherwise orphan).
DELETE FROM "UnitValue"
WHERE "agentFixedPricingId" IN (SELECT fixed_id FROM _v2_wipe_fixed);

DELETE FROM "ExampleOutput"
WHERE "registryEntryId" IN (SELECT entry_id FROM _v2_wipe_entries);

-- 3. Delete the entries themselves (cascades SupportedPaymentSource and
--    AgentVerification via ON DELETE CASCADE).
DELETE FROM "RegistryEntry"
WHERE "id" IN (SELECT entry_id FROM _v2_wipe_entries);

-- 4. Delete the now-unreferenced pricing tail (RegistryEntry -> AgentPricing is
--    ON DELETE RESTRICT, so this only succeeds once the entries are gone).
DELETE FROM "AgentPricing"
WHERE "id" IN (SELECT pricing_id FROM _v2_wipe_entries);

DELETE FROM "AgentFixedPricing"
WHERE "id" IN (SELECT fixed_id FROM _v2_wipe_fixed);

DROP TABLE _v2_wipe_entries;
DROP TABLE _v2_wipe_fixed;

-- 5. Repoint the V2 source(s) to the new policy and reset sync progress so the
--    background sync re-scans the new contract from the first page.
UPDATE "RegistrySource"
SET "policyId" = '67ab0c92c4ac1610895a1c965ee50aba41a8f1513b15240723b3bd0b',
    "lastTxId" = NULL,
    "lastCheckedPage" = 1,
    "updatedAt" = NOW()
WHERE "policyId" = '7890b485b808043ef80136a447a3a43c18893a309dc323d1f8b0a13d';
