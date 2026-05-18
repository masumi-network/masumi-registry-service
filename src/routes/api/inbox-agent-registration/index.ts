import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import { tokenCreditService } from '@/services/token-credit';
import { inboxAgentRegistrationService } from '@/services/inbox-agent-registration';
import {
  queryInboxAgentRegistrationSchemaInput,
  queryInboxAgentRegistrationSchemaOutput,
  refreshInboxAgentRegistrationSchemaInput,
  refreshInboxAgentRegistrationSchemaOutput,
  searchInboxAgentRegistrationSchemaInput,
  serializeInboxAgentRegistrations,
} from './schemas';
import createHttpError from 'http-errors';

export * from './schemas';

export const queryInboxAgentRegistrationPost =
  authenticatedEndpointFactory.build<
    typeof queryInboxAgentRegistrationSchemaOutput,
    typeof queryInboxAgentRegistrationSchemaInput
  >({
    method: 'post',
    input: queryInboxAgentRegistrationSchemaInput,
    output: queryInboxAgentRegistrationSchemaOutput,
    handler: async ({
      input,
      ctx,
    }: {
      input: z.infer<typeof queryInboxAgentRegistrationSchemaInput>;
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
        'query inbox registrations: ' + (input.filter?.agentSlug ?? '')
      );

      const data =
        await inboxAgentRegistrationService.getInboxAgentRegistrations(input);

      return queryInboxAgentRegistrationSchemaOutput.parse({
        registrations: serializeInboxAgentRegistrations(data, input.limit),
      });
    },
  });

export const searchInboxAgentRegistrationPost =
  authenticatedEndpointFactory.build<
    typeof queryInboxAgentRegistrationSchemaOutput,
    typeof searchInboxAgentRegistrationSchemaInput
  >({
    method: 'post',
    input: searchInboxAgentRegistrationSchemaInput,
    output: queryInboxAgentRegistrationSchemaOutput,
    handler: async ({
      input,
      ctx,
    }: {
      input: z.infer<typeof searchInboxAgentRegistrationSchemaInput>;
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
        'search inbox registrations: ' + input.query
      );

      const data =
        await inboxAgentRegistrationService.searchInboxAgentRegistrations(
          input
        );

      return queryInboxAgentRegistrationSchemaOutput.parse({
        registrations: serializeInboxAgentRegistrations(data, input.limit),
      });
    },
  });

export const refreshInboxAgentRegistrationPost =
  authenticatedEndpointFactory.build<
    typeof refreshInboxAgentRegistrationSchemaOutput,
    typeof refreshInboxAgentRegistrationSchemaInput
  >({
    method: 'post',
    input: refreshInboxAgentRegistrationSchemaInput,
    output: refreshInboxAgentRegistrationSchemaOutput,
    handler: async ({
      input,
      ctx,
    }: {
      input: z.infer<typeof refreshInboxAgentRegistrationSchemaInput>;
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
        'refresh inbox registration: ' + input.agentIdentifier
      );

      const data =
        await inboxAgentRegistrationService.refreshInboxAgentRegistration(
          input
        );
      if (!data) {
        throw createHttpError(404, 'Inbox agent registration not found');
      }

      const [registration] = serializeInboxAgentRegistrations([data], 1);
      return refreshInboxAgentRegistrationSchemaOutput.parse({
        registration,
      });
    },
  });
