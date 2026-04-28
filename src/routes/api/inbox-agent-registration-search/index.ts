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
      options,
    }: {
      input: z.infer<typeof searchInboxAgentRegistrationSchemaInput>;
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
