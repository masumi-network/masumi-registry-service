import { PricingType } from '@prisma/client';
import { z } from '@/utils/zod-openapi';

export const web3CardanoMetadataSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .or(z.array(z.string().min(1))),
    description: z.string().or(z.array(z.string())).optional(),
    // Access-model discriminator. Absent -> Standard. OpenAPI/x402 entries carry
    // it (and omit api_base_url), so the .strict() schema must accept these keys.
    type: z
      .string()
      .refine((type) => type !== 'a2aV1', 'A2A requires V2 registry metadata')
      .optional(),
    api_base_url: z
      .string()
      .min(1)
      .or(z.array(z.string().min(1)))
      .optional(),
    openapi_spec_url: z
      .string()
      .min(1)
      .or(z.array(z.string().min(1)))
      .optional(),
    x402_resources_url: z
      .string()
      .min(1)
      .or(z.array(z.string().min(1)))
      .optional(),
    example_output: z
      .array(
        z.object({
          name: z
            .string()
            .max(60)
            .or(z.array(z.string().max(60)).min(1).max(1)),
          mime_type: z
            .string()
            .min(1)
            .max(60)
            .or(z.array(z.string().min(1).max(60)).min(1).max(1)),
          url: z.string().or(z.array(z.string())),
        })
      )
      .optional(),
    capability: z
      .object({
        name: z.string().or(z.array(z.string())),
        version: z
          .string()
          .max(60)
          .or(z.array(z.string().max(60)).min(1).max(1)),
      })
      .optional(),
    author: z.object({
      name: z
        .string()
        .min(1)
        .or(z.array(z.string().min(1))),
      contact_email: z.string().or(z.array(z.string())).optional(),
      contact_other: z.string().or(z.array(z.string())).optional(),
      organization: z.string().or(z.array(z.string())).optional(),
    }),
    legal: z
      .object({
        privacy_policy: z.string().or(z.array(z.string())).optional(),
        terms: z.string().or(z.array(z.string())).optional(),
        other: z.string().or(z.array(z.string())).optional(),
      })
      .optional(),
    tags: z.array(z.string().min(1)).min(1),
    agentPricing: z
      .object({
        pricingType: z.enum([PricingType.Fixed]),
        fixedPricing: z
          .array(
            z.object({
              amount: z.coerce.number().int().min(1),
              unit: z
                .string()
                .min(1)
                .or(z.array(z.string().min(1))),
            })
          )
          .min(1)
          .max(25),
      })
      .or(
        z.object({
          pricingType: z.enum([PricingType.Free]),
        })
      )
      .or(
        z.object({
          pricingType: z.enum([PricingType.Dynamic]),
        })
      ),
    image: z.string().or(z.array(z.string())),
    metadata_version: z.coerce.number().int().min(1).max(1),
  })
  .strict();
