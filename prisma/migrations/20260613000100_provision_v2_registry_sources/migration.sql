-- Auto-provision a V2 registry source for every network that already has a V1
-- source, reusing the V1 source's RegistrySourceConfig (the Blockfrost token).
--
-- The V2 registry validator is unparameterized, so its policyId is identical on
-- both networks: 7890b485b808043ef80136a447a3a43c18893a309dc323d1f8b0a13d.
-- That value is derived via getRegistryScriptV2() and asserted against the mesh
-- 1.9.0-beta.102 line in src/utils/contracts/registry-script.spec.ts, so this
-- literal is the verified V2 contract policy ("the right contract address").
--
-- Idempotent: only inserts when no V2 source for that network exists yet, so it
-- is safe to re-run and a no-op once provisioned.
INSERT INTO "RegistrySource" (
  "id", "createdAt", "updatedAt", "network", "url", "policyId",
  "registrySourceConfigId", "lastCheckedPage", "note"
)
SELECT
  gen_random_uuid()::text,
  NOW(),
  NOW(),
  v1."network",
  v1."url",
  '7890b485b808043ef80136a447a3a43c18893a309dc323d1f8b0a13d',
  v1."registrySourceConfigId",
  1,
  'Auto-provisioned V2 registry source (migrated from the V1 source)'
FROM (
  -- Collapse to at most one V1 source per network (a network may hold more than
  -- one V1 policyId), so the V2 insert can never produce two rows for the same
  -- network and abort on @@unique([network, policyId]). Picks the oldest source.
  SELECT DISTINCT ON ("network")
    "network", "url", "registrySourceConfigId"
  FROM "RegistrySource"
  WHERE "policyId" IN (
    '7e8bdaf2b2b919a3a4b94002cafb50086c0c845fe535d07a77ab7f77',
    'ad6424e3ce9e47bbd8364984bd731b41de591f1d11f6d7d43d0da9b9'
  )
  ORDER BY "network", "createdAt"
) v1
WHERE NOT EXISTS (
  SELECT 1
  FROM "RegistrySource" existing
  WHERE existing."network" = v1."network"
    AND existing."policyId" = '7890b485b808043ef80136a447a3a43c18893a309dc323d1f8b0a13d'
);
