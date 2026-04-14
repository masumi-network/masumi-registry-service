DROP INDEX IF EXISTS "ApiKey_token_idx";
DROP INDEX IF EXISTS "ApiKey_token_key";

ALTER TABLE "ApiKey"
DROP COLUMN "token";
