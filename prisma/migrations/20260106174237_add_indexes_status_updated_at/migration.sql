-- CreateIndex
CREATE INDEX "RegistryEntry_statusUpdatedAt_idx" ON "RegistryEntry"("statusUpdatedAt");

-- CreateIndex
CREATE INDEX "RegistryEntry_statusUpdatedAt_id_idx" ON "RegistryEntry"("statusUpdatedAt", "id");
