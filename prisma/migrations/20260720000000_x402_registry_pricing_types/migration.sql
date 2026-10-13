ALTER TABLE "SupportedPaymentSource"
ADD COLUMN "pricingType" "PricingType";

-- Every x402 source indexed before per-source pricing existed was Fixed by
-- construction. Preserve that meaning while Cardano rows continue to derive
-- their pricing from AgentPricing.
UPDATE "SupportedPaymentSource"
SET "pricingType" = 'Fixed'
WHERE "chain" = 'EVM';
