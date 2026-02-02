import { z } from '@/utils/zod-openapi';
import { Network, PaymentType, PricingType, Status } from '@prisma/client';

export const snapshotAmountSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+$/, 'Amount must be a numeric string (BigInt format)'),
  unit: z.string(),
});

export const snapshotFixedPricingSchema = z.object({
  amounts: z.array(snapshotAmountSchema).min(1).max(25),
});

export const snapshotAgentPricingSchema = z.discriminatedUnion('pricingType', [
  z.object({
    pricingType: z.literal(PricingType.Free),
    fixedPricing: z.null(),
  }),
  z.object({
    pricingType: z.literal(PricingType.Fixed),
    fixedPricing: snapshotFixedPricingSchema,
  }),
]);

export const snapshotCapabilitySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().nullable(),
});

export const snapshotExampleOutputSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  url: z.string().min(1),
});

export const snapshotEntrySchema = z.object({
  assetIdentifier: z.string().min(1),
  name: z.string().min(1),
  apiBaseUrl: z.string().min(1),
  description: z.string().nullable(),
  image: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
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

export const snapshotSchema = z
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

export type ValidatedSnapshot = z.infer<typeof snapshotSchema>;
export type ValidatedSnapshotEntry = z.infer<typeof snapshotEntrySchema>;

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
