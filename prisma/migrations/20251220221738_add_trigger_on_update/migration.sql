CREATE OR REPLACE FUNCTION set_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."statusUpdatedAt" := COALESCE(NEW."statusUpdatedAt", NOW());
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    NEW."statusUpdatedAt" := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_status_updated_at ON "RegistryEntry";
DROP TRIGGER IF EXISTS trg_set_status_updated_at_insert ON "RegistryEntry";

CREATE TRIGGER trg_set_status_updated_at_insert
BEFORE INSERT ON "RegistryEntry"
FOR EACH ROW
EXECUTE FUNCTION set_status_updated_at();

CREATE TRIGGER trg_set_status_updated_at
BEFORE UPDATE ON "RegistryEntry"
FOR EACH ROW
EXECUTE FUNCTION set_status_updated_at();