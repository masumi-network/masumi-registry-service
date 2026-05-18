import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import { tokenCreditService } from '@/services/token-credit';
import { inboxAgentRegistrationService } from '@/services/inbox-agent-registration';
import {
  queryInboxAgentRegistrationSchemaOutput,
  serializeInboxAgentRegistrations,
} from '@/routes/api/inbox-agent-registration/schemas';
import { searchInboxAgentRegistrationSchemaInput } from './schemas';

export * from './schemas';

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
