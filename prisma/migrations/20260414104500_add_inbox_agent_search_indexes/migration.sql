CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "InboxAgentRegistration_name_idx"
ON "InboxAgentRegistration"("name");

CREATE INDEX IF NOT EXISTS "InboxAgentRegistration_linkedEmail_idx"
ON "InboxAgentRegistration"("linkedEmail");

CREATE INDEX IF NOT EXISTS "InboxAgentRegistration_registrySourceId_idx"
ON "InboxAgentRegistration"("registrySourceId");

CREATE INDEX IF NOT EXISTS "InboxAgentRegistration_registrySourceId_status_updatedAt_idx"
ON "InboxAgentRegistration"("registrySourceId", "status", "updatedAt");

CREATE INDEX IF NOT EXISTS "InboxAgentRegistration_name_trgm_idx"
ON "InboxAgentRegistration"
USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "InboxAgentRegistration_agentSlug_trgm_idx"
ON "InboxAgentRegistration"
USING GIN ("agentSlug" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "InboxAgentRegistration_linkedEmail_trgm_idx"
ON "InboxAgentRegistration"
USING GIN ("linkedEmail" gin_trgm_ops);
