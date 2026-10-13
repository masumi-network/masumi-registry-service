-- Map blank optional text (empty or whitespace-only) to NULL, matching metadataStringConvert.
-- Rows synced before this change stored '' for missing optional metadata.
UPDATE "RegistryEntry" SET "apiBaseUrl" = NULL WHERE "apiBaseUrl" ~ '^\s*$';
UPDATE "RegistryEntry" SET "openApiSpecUrl" = NULL WHERE "openApiSpecUrl" ~ '^\s*$';
UPDATE "RegistryEntry" SET "x402ResourcesUrl" = NULL WHERE "x402ResourcesUrl" ~ '^\s*$';
UPDATE "RegistryEntry" SET "description" = NULL WHERE "description" ~ '^\s*$';
UPDATE "RegistryEntry" SET "authorName" = NULL WHERE "authorName" ~ '^\s*$';
UPDATE "RegistryEntry" SET "authorContactEmail" = NULL WHERE "authorContactEmail" ~ '^\s*$';
UPDATE "RegistryEntry" SET "authorContactOther" = NULL WHERE "authorContactOther" ~ '^\s*$';
UPDATE "RegistryEntry" SET "authorOrganization" = NULL WHERE "authorOrganization" ~ '^\s*$';
UPDATE "RegistryEntry" SET "privacyPolicy" = NULL WHERE "privacyPolicy" ~ '^\s*$';
UPDATE "RegistryEntry" SET "termsAndCondition" = NULL WHERE "termsAndCondition" ~ '^\s*$';
UPDATE "RegistryEntry" SET "otherLegal" = NULL WHERE "otherLegal" ~ '^\s*$';
