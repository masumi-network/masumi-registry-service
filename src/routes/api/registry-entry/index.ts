import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from 'zod';
import { ez } from 'express-zod-api';
import { tokenCreditService } from '@/services/token-credit';
import { $Enums, Network } from '@prisma/client';
import { registryEntryService } from '@/services/registry-entry';

export const queryRegistrySchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  //optional data
  cursorId: z.string().min(1).max(50).optional(),
  filter: z
    .object({
      paymentTypes: z.array(z.nativeEnum($Enums.PaymentType)).max(5).optional(),
      status: z.array(z.nativeEnum($Enums.Status)).max(5).optional(),
      policyId: z.string().min(1).max(250).optional(),
      assetIdentifier: z.string().min(1).max(250).optional(),
      tags: z.array(z.string().min(1).max(150)).optional(),
      capability: z
        .object({
          name: z.string().min(1).max(150),
          version: z.string().max(150).optional(),
        })
        .optional(),
    })
    .optional(),
  //force refresh
  minRegistryDate: ez.dateIn().optional(),
  minHealthCheckDate: ez.dateIn().optional(),
});

export const queryRegistrySchemaOutput = z.object({
  entries: z.array(
    z.object({
      RegistrySource: z.object({
        id: z.string(),
        type: z.nativeEnum($Enums.RegistryEntryType),
        policyId: z.string().nullable(),
        url: z.string().nullable(),
      }),
      Capability: z
        .object({
          name: z.string().nullable(),
          version: z.string().nullable(),
        })
        .nullable(),
      name: z.string(),
      description: z.string().nullable(),
      status: z.nativeEnum($Enums.Status),
      id: z.string(),
      lastUptimeCheck: ez.dateOut(),
      uptimeCount: z.number(),
      uptimeCheckCount: z.number(),
      apiBaseUrl: z.string(),
      authorName: z.string().nullable(),
      authorOrganization: z.string().nullable(),
      authorContactEmail: z.string().nullable(),
      authorContactOther: z.string().nullable(),
      image: z.string().nullable(),
      privacyPolicy: z.string().nullable(),
      termsAndCondition: z.string().nullable(),
      otherLegal: z.string().nullable(),
      tags: z.array(z.string()).nullable(),
      agentIdentifier: z.string(),
      AgentPricing: z
        .object({
          pricingType: z.nativeEnum($Enums.PricingType),
          FixedPricing: z.object({
            Amounts: z.array(
              z.object({
                amount: z.string(),
                unit: z.string(),
              })
            ),
          }),
        })
        .or(
          z.object({
            pricingType: z.nativeEnum($Enums.PricingType),
          })
        ),
      ExampleOutput: z.array(
        z.object({
          name: z.string(),
          mimeType: z.string(),
          url: z.string(),
        })
      ),
    })
  ),
});

export const queryRegistryEntryPost = authenticatedEndpointFactory.build({
  method: 'post',
  input: queryRegistrySchemaInput,
  output: queryRegistrySchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof queryRegistrySchemaInput>;
    options: {
      id: string;
      accumulatedUsageCredits: number;
      maxUsageCredits: number | null;
      usageLimited: boolean;
    };
  }) => {
    const tokenCost = 0;
    //TODO update cost model
    //TODO add custom errors
    await tokenCreditService.handleTokenCredits(
      options,
      tokenCost,
      'query for: ' + input.filter?.capability?.name
    );
    const data = await registryEntryService.getRegistryEntries(input);

    return {
      entries: data
        .slice(0, Math.min(input.limit, data.length))
        .map((entry) => ({
          ...entry,
          agentIdentifier: entry.assetIdentifier,
          AgentPricing:
            entry.AgentPricing.pricingType == $Enums.PricingType.None
              ? {
                  pricingType: $Enums.PricingType.None,
                }
              : {
                  pricingType: entry.AgentPricing.pricingType,
                  FixedPricing: {
                    Amounts:
                      entry.AgentPricing.FixedPricing?.Amounts.map(
                        (amount) => ({
                          amount: amount.amount.toString(),
                          unit: amount.unit,
                        })
                      ) ?? [],
                  },
                },
          ExampleOutput: [],
        })),
    };
  },
});
