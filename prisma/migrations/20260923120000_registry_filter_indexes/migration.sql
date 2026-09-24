-- Indexes backing the registry filters added in MAS-607 slice 1:
-- registeredAfter/registeredBefore (createdAt) and pricing unit/amount lookups.

-- CreateIndex
CREATE INDEX "RegistryEntry_createdAt_idx" ON "RegistryEntry"("createdAt");

-- CreateIndex
CREATE INDEX "UnitValue_agentFixedPricingId_unit_idx" ON "UnitValue"("agentFixedPricingId", "unit");
