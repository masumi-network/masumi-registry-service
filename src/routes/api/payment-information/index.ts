import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from 'zod';
import { ez } from 'express-zod-api';
import { $Enums } from '@prisma/client';
import { tokenCreditService } from '@/services/token-credit';
import { paymentInformationRepository } from '@/repositories/payment-information';
import createHttpError from 'http-errors';

export const queryPaymentInformationInput = z.object({
  agentIdentifier: z.string().min(57).max(250),
});

export const queryPaymentInformationSchemaOutput = z.object({
  RegistrySource: z.object({
    type: z.nativeEnum($Enums.RegistryEntryType),
    policyId: z.string().nullable(),
    url: z.string().nullable(),
  }),
  PaymentIdentifier: z.array(
    z.object({
      paymentIdentifier: z.string().nullable(),
      paymentType: z.nativeEnum($Enums.PaymentType),
      sellerVKey: z.string().nullable(),
    })
  ),
  Capability: z
    .object({
      name: z.string().nullable(),
      version: z.string().nullable(),
    })
    .nullable(),
  AgentPricing: z.object({
    pricingType: z.nativeEnum($Enums.PricingType),
    FixedPricing: z.object({
      Amounts: z.array(
        z.object({
          amount: z.string(),
          unit: z.string(),
        })
      ),
    }),
  }),
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
  ExampleOutput: z.array(
    z.object({
      name: z.string(),
      mimeType: z.string(),
      url: z.string(),
    })
  ),
});

export const queryPaymentInformationGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: queryPaymentInformationInput,
  output: queryPaymentInformationSchemaOutput,
  handler: async ({
    input,
    options,
  }: {
    input: z.infer<typeof queryPaymentInformationInput>;
    options: {
      id: string;
      accumulatedUsageCredits: number;
      maxUsageCredits: number | null;
      usageLimited: boolean;
    };
  }) => {
    const tokenCost = 0;
    await tokenCreditService.handleTokenCredits(
      options,
      tokenCost,
      'query for payment information: ' + input.agentIdentifier
    );
    const result = await paymentInformationRepository.getPaymentInformation(
      input.agentIdentifier
    );
    if (!result) {
      throw createHttpError(404, 'Payment information not found');
    }
    return {
      ...result,
      agentIdentifier: result.assetIdentifier,
      AgentPricing: {
        pricingType: result.AgentPricing.pricingType,
        FixedPricing: {
          Amounts:
            result.AgentPricing.FixedPricing?.Amounts.map((amount) => ({
              amount: amount.amount.toString(),
              unit: amount.unit,
            })) ?? [],
        },
      },
    };
  },
});
