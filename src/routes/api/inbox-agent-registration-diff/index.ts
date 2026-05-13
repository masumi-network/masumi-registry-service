import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from '@/utils/zod-openapi';
import { tokenCreditService } from '@/services/token-credit';
import { inboxAgentRegistrationService } from '@/services/inbox-agent-registration';
import {
  inboxAgentRegistrationDiffSchemaInput,
  queryInboxAgentRegistrationSchemaOutput,
  serializeInboxAgentRegistrations,
} from '@/routes/api/inbox-agent-registration';

export const inboxAgentRegistrationDiffPost =
  authenticatedEndpointFactory.build<
    typeof queryInboxAgentRegistrationSchemaOutput,
    typeof inboxAgentRegistrationDiffSchemaInput
  >({
    method: 'post',
    input: inboxAgentRegistrationDiffSchemaInput,
    output: queryInboxAgentRegistrationSchemaOutput,
    handler: async ({
      input,
      options,
    }: {
      input: z.infer<typeof inboxAgentRegistrationDiffSchemaInput>;
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
        'inbox registration diff since: ' +
          input.statusUpdatedAfter.toISOString()
      );

      const data =
        await inboxAgentRegistrationService.getInboxAgentRegistrationDiffEntries(
          input
        );

      return queryInboxAgentRegistrationSchemaOutput.parse({
        registrations: serializeInboxAgentRegistrations(data, input.limit),
      });
    },
  });
