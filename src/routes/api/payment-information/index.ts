import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { $Enums } from '@prisma/client';
import { tokenCreditService } from '@/services/token-credit';
import { paymentInformationRepository } from '@/repositories/payment-information';
import createHttpError from 'http-errors';
import { prisma } from '@/utils/db';
import { resolvePaymentKeyHash } from '@meshsdk/core';
import { getBlockfrostInstance } from '@/utils/blockfrost';

export const queryPaymentInformationInput = z.object({
  agentIdentifier: z.string().min(57).max(250),
});

export const queryPaymentInformationSchemaOutput = z
  .object({
    createdAt: z.date(),
    updatedAt: z.date(),
    metadataVersion: z.number().int(),
    RegistrySource: z.object({
      policyId: z.string().nullable(),
      url: z.string().nullable(),
    }),
    sellerWallet: z.object({
      address: z.string(),
      vkey: z.string(),
    }),
    Capability: z
      .object({
        name: z.string().nullable(),
        version: z.string().nullable(),
      })
      .nullable(),
    AgentPricing: z
      .object({
        pricingType: z.literal($Enums.PricingType.Fixed),
        FixedPricing: z.object({
          Amounts: z.array(
            z.object({
              amount: z.string(),
              unit: z.string(),
            })
          ),
        }),
      })
      .or(z.object({ pricingType: z.literal($Enums.PricingType.Free) }))
      .or(z.object({ pricingType: z.literal($Enums.PricingType.Dynamic) }))
      .nullable(),
    SupportedPaymentSources: z.array(
      z.object({
        chain: z.string(),
        network: z.string(),
        sourceIndex: z.number().int().min(0),
        paymentSourceType: z.string().nullable(),
        address: z.string(),
        scheme: z.string().nullable(),
        pricing: z
          .object({
            pricingType: z.literal($Enums.PricingType.Fixed),
            fixed: z.array(
              z.object({
                asset: z.string(),
                amount: z.string(),
                decimals: z.number().int().min(0).max(255).optional(),
              })
            ),
          })
          .or(
            z.object({
              pricingType: z.literal($Enums.PricingType.Dynamic),
              dynamic: z
                .array(
                  z.object({
                    asset: z.string(),
                    decimals: z.number().int().min(0).max(255),
                  })
                )
                .max(1)
                .optional(),
            })
          )
          .or(
            z.object({
              pricingType: z.literal($Enums.PricingType.Free),
            })
          ),
        payTo: z.string().nullable(),
        resource: z.string().nullable(),
      })
    ),
    name: z.string(),
    description: z.string().nullable(),
    status: z.nativeEnum($Enums.Status),
    id: z.string(),
    lastUptimeCheck: ez.dateOut(),
    uptimeCount: z.number(),
    uptimeCheckCount: z.number(),
    apiBaseUrl: z.string().nullable(),
    authorName: z.string().nullable(),
    authorOrganization: z.string().nullable(),
    authorContactEmail: z.string().nullable(),
    authorContactOther: z.string().nullable(),
    image: z.string().nullable(),
    privacyPolicy: z.string().nullable(),
    termsAndCondition: z.string().nullable(),
    otherLegal: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    paymentType: z.nativeEnum($Enums.PaymentType),
    agentIdentifier: z.string(),
    ExampleOutput: z.array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        url: z.string(),
      })
    ),
  })
  .openapi('PaymentInformation');

export const queryPaymentInformationGet = authenticatedEndpointFactory.build({
  method: 'get',
  input: queryPaymentInformationInput,
  output: queryPaymentInformationSchemaOutput,
  handler: async ({
    input,
    ctx,
  }: {
    input: z.infer<typeof queryPaymentInformationInput>;
    ctx: {
      id: string;
      accumulatedUsageCredits: number;
      maxUsageCredits: number | null;
      usageLimited: boolean;
    };
  }) => {
    const tokenCost = 0;
    await tokenCreditService.handleTokenCredits(
      ctx,
      tokenCost,
      'query for payment information: ' + input.agentIdentifier
    );
    const result = await paymentInformationRepository.getPaymentInformation(
      input.agentIdentifier
    );
    if (!result) {
      throw createHttpError(404, 'Payment information not found');
    }
    const registrySource = await prisma.registrySource.findUnique({
      where: {
        id: result.RegistrySource.id,
      },
      include: {
        RegistrySourceConfig: true,
      },
    });
    if (!registrySource) {
      throw createHttpError(404, 'Registry source not found');
    }
    const blockfrost = getBlockfrostInstance(
      registrySource.network,
      registrySource.RegistrySourceConfig.rpcProviderApiKey
    );
    const holderData = await blockfrost.assetsAddresses(
      result.assetIdentifier,
      {
        order: 'desc',
      }
    );
    if (holderData.length < 1) {
      throw createHttpError(404, 'Payment information not found');
    }
    const sellerWallet = holderData[0];
    return {
      ...result,
      agentIdentifier: result.assetIdentifier,
      sellerWallet: {
        address: sellerWallet.address,
        vkey: resolvePaymentKeyHash(sellerWallet.address),
      },
      AgentPricing:
        result.AgentPricing == null
          ? null
          : result.AgentPricing.pricingType === $Enums.PricingType.Fixed
            ? {
                pricingType: $Enums.PricingType.Fixed,
                FixedPricing: {
                  Amounts:
                    result.AgentPricing.FixedPricing?.Amounts.map((amount) => ({
                      amount: amount.amount.toString(),
                      unit: amount.unit,
                    })) ?? [],
                },
              }
            : {
                // Free or Dynamic — no FixedPricing
                pricingType: result.AgentPricing.pricingType,
              },
      SupportedPaymentSources: result.SupportedPaymentSources.map((source) => {
        if (source.Pricing == null) {
          throw createHttpError(
            500,
            `Indexed payment source ${source.sourceIndex} is missing pricing`
          );
        }
        const amounts = source.Pricing.FixedPricing?.Amounts ?? [];
        const pricing =
          source.Pricing.pricingType === $Enums.PricingType.Fixed
            ? {
                pricingType: $Enums.PricingType.Fixed,
                fixed: amounts.map((amount) => ({
                  asset: amount.unit,
                  amount: amount.amount.toString(),
                  ...(source.fixedDecimals != null
                    ? { decimals: source.fixedDecimals }
                    : {}),
                })),
              }
            : source.Pricing.pricingType === $Enums.PricingType.Dynamic
              ? {
                  pricingType: $Enums.PricingType.Dynamic,
                  ...(source.dynamicAsset != null &&
                  source.dynamicDecimals != null
                    ? {
                        dynamic: [
                          {
                            asset: source.dynamicAsset,
                            decimals: source.dynamicDecimals,
                          },
                        ],
                      }
                    : {}),
                }
              : { pricingType: $Enums.PricingType.Free };
        return {
          chain: source.chain,
          network: source.network,
          sourceIndex: source.sourceIndex,
          paymentSourceType: source.paymentSourceType,
          address: source.address,
          scheme: source.scheme,
          pricing,
          payTo: source.payTo,
          resource: source.resource,
        };
      }),
    };
  },
});
