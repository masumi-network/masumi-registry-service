CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "RegistryEntry"
ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION "computeRegistryEntrySearchText"(
  "entryName" TEXT,
  "entryDescription" TEXT,
  "entryAuthorName" TEXT,
  "entryAuthorOrganization" TEXT,
  "entryApiBaseUrl" TEXT,
  "entryAssetIdentifier" TEXT,
  "entryTags" TEXT[],
  "entryCapabilitiesId" TEXT
)
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT COALESCE(
    LOWER(
      TRIM(
        REGEXP_REPLACE(
          CONCAT_WS(
            ' ',
            NULLIF(TRIM("entryName"), ''),
            NULLIF(TRIM("entryDescription"), ''),
            NULLIF(TRIM("entryAuthorName"), ''),
            NULLIF(TRIM("entryAuthorOrganization"), ''),
            NULLIF(TRIM("entryApiBaseUrl"), ''),
            NULLIF(TRIM("entryAssetIdentifier"), ''),
            NULLIF(
              TRIM(
                (
                  SELECT "Capability"."name"
                  FROM "Capability"
                  WHERE "Capability"."id" = "entryCapabilitiesId"
                )
              ),
              ''
            ),
            NULLIF(
              TRIM(
                (
                  SELECT "Capability"."version"
                  FROM "Capability"
                  WHERE "Capability"."id" = "entryCapabilitiesId"
                )
              ),
              ''
            ),
            NULLIF(
              TRIM(
                REGEXP_REPLACE(
                  COALESCE(array_to_string("entryTags", ' '), ''),
                  '\s+',
                  ' ',
                  'g'
                )
              ),
              ''
            )
          ),
          '\s+',
          ' ',
          'g'
        )
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION "setRegistryEntrySearchText"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."searchText" := "computeRegistryEntrySearchText"(
    NEW."name",
    NEW."description",
    NEW."authorName",
    NEW."authorOrganization",
    NEW."apiBaseUrl",
    NEW."assetIdentifier",
    NEW."tags",
    NEW."capabilitiesId"
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trgSetRegistryEntrySearchText" ON "RegistryEntry";

CREATE TRIGGER "trgSetRegistryEntrySearchText"
BEFORE INSERT OR UPDATE OF
  "name",
  "description",
  "authorName",
  "authorOrganization",
  "apiBaseUrl",
  "assetIdentifier",
  "tags",
  "capabilitiesId"
ON "RegistryEntry"
FOR EACH ROW
EXECUTE FUNCTION "setRegistryEntrySearchText"();

CREATE OR REPLACE FUNCTION "refreshRegistryEntrySearchTextForCapability"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "RegistryEntry"
  SET "searchText" = "computeRegistryEntrySearchText"(
    "RegistryEntry"."name",
    "RegistryEntry"."description",
    "RegistryEntry"."authorName",
    "RegistryEntry"."authorOrganization",
    "RegistryEntry"."apiBaseUrl",
    "RegistryEntry"."assetIdentifier",
    "RegistryEntry"."tags",
    "RegistryEntry"."capabilitiesId"
  )
  WHERE "RegistryEntry"."capabilitiesId" = NEW."id";

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trgRefreshRegistryEntrySearchTextForCapability"
ON "Capability";

CREATE TRIGGER "trgRefreshRegistryEntrySearchTextForCapability"
AFTER UPDATE OF "name", "version"
ON "Capability"
FOR EACH ROW
WHEN (
  OLD."name" IS DISTINCT FROM NEW."name"
  OR OLD."version" IS DISTINCT FROM NEW."version"
)
EXECUTE FUNCTION "refreshRegistryEntrySearchTextForCapability"();

UPDATE "RegistryEntry"
SET "searchText" = "computeRegistryEntrySearchText"(
  "RegistryEntry"."name",
  "RegistryEntry"."description",
  "RegistryEntry"."authorName",
  "RegistryEntry"."authorOrganization",
  "RegistryEntry"."apiBaseUrl",
  "RegistryEntry"."assetIdentifier",
  "RegistryEntry"."tags",
  "RegistryEntry"."capabilitiesId"
);

CREATE INDEX IF NOT EXISTS "RegistryEntry_searchText_trgm_idx"
ON "RegistryEntry"
USING GIN ("searchText" gin_trgm_ops);
