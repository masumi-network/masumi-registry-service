import { z } from '@/utils/zod-openapi';
import { Network, PaymentType, PricingType, Status } from '@prisma/client';

const snapshotAmountSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+$/, 'Amount must be a numeric string (BigInt format)'),
  unit: z.string(),
});

const snapshotFixedPricingSchema = z.object({
  amounts: z.array(snapshotAmountSchema).max(25),
});

const snapshotAgentPricingSchema = z.discriminatedUnion('pricingType', [
  z.object({
    pricingType: z.literal(PricingType.Free),
    fixedPricing: z.null(),
  }),
  z.object({
    pricingType: z.literal(PricingType.Fixed),
    fixedPricing: snapshotFixedPricingSchema,
  }),
]);

const snapshotCapabilitySchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().nullable(),
});

const snapshotExampleOutputSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  url: z.string(),
});

const snapshotSupportedPaymentSourceSchema = z
  .object({
    chain: z.string(),
    network: z.string(),
    paymentSourceType: z.string().nullable(),
    address: z.string(),
    scheme: z.string().nullable(),
    // Legacy companion snapshots predate per-source pricing; every EVM row in
    // that format was Fixed by construction.
    pricingType: z.nativeEnum(PricingType).nullable().optional(),
    asset: z.string().nullable(),
    amount: z
      .string()
      .regex(/^\d+$/, 'Amount must be a numeric string (BigInt format)')
      .nullable(),
    decimals: z.number().int().nullable(),
    payTo: z.string().nullable(),
    resource: z.string().nullable(),
    extra: z.unknown().optional(),
  })
  .transform((source) => ({
    ...source,
    pricingType:
      source.pricingType ?? (source.chain === 'EVM' ? PricingType.Fixed : null),
  }));

const snapshotEntrySchema = z.object({
  assetIdentifier: z.string().min(1),
  name: z.string(),
  apiBaseUrl: z.string(),
  description: z.string().nullable(),
  image: z.string(),
  tags: z.array(z.string()),
  authorName: z.string().nullable(),
  authorContactEmail: z.string().nullable(),
  authorContactOther: z.string().nullable(),
  authorOrganization: z.string().nullable(),
  privacyPolicy: z.string().nullable(),
  termsAndCondition: z.string().nullable(),
  otherLegal: z.string().nullable(),
  lastUptimeCheck: z.string().datetime(),
  uptimeCount: z.number().int().min(0),
  uptimeCheckCount: z.number().int().min(0),
  status: z.nativeEnum(Status),
  statusUpdatedAt: z.string().datetime(),
  paymentType: z.nativeEnum(PaymentType),
  metadataVersion: z.number().int().min(1),
  capability: snapshotCapabilitySchema.nullable(),
  agentPricing: snapshotAgentPricingSchema,
  exampleOutputs: z.array(snapshotExampleOutputSchema),
});

const snapshotSchema = z
  .object({
    version: z.literal('1.0.0'),
    exportedAt: z.string().datetime(),
    network: z.nativeEnum(Network),
    policyId: z.string().min(1),
    lastTxId: z.string().nullable(),
    lastCheckedPage: z.number().int().min(1),
    entryCount: z.number().int().min(0),
    entries: z.array(snapshotEntrySchema),
  })
  .refine((data) => data.entries.length === data.entryCount, {
    message: 'Entry count does not match entries array length',
    path: ['entryCount'],
  });

type ValidatedSnapshot = z.infer<typeof snapshotSchema>;

export function validateSnapshot(data: unknown): {
  success: boolean;
  data?: ValidatedSnapshot;
  errors?: z.ZodError;
} {
  const result = snapshotSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

const paymentSourcesEntrySchema = z.object({
  assetIdentifier: z.string().min(1),
  sources: z.array(snapshotSupportedPaymentSourceSchema),
});

const paymentSourcesSchema = z
  .object({
    version: z.literal('1.0.0'),
    exportedAt: z.string().datetime(),
    network: z.nativeEnum(Network),
    policyId: z.string().min(1),
    entryCount: z.number().int().min(0),
    sourceCount: z.number().int().min(0),
    entries: z.array(paymentSourcesEntrySchema),
  })
  .refine((data) => data.entries.length === data.entryCount, {
    message: 'entryCount does not match entries array length',
    path: ['entryCount'],
  })
  .refine(
    (data) =>
      data.entries.reduce((sum, e) => sum + e.sources.length, 0) ===
      data.sourceCount,
    {
      message: 'sourceCount does not match total payment sources',
      path: ['sourceCount'],
    }
  );

type ValidatedPaymentSources = z.infer<typeof paymentSourcesSchema>;

export function validatePaymentSources(data: unknown): {
  success: boolean;
  data?: ValidatedPaymentSources;
  errors?: z.ZodError;
} {
  const result = paymentSourcesSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
