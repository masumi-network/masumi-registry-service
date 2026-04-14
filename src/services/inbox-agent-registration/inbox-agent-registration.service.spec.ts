import { InboxAgentRegistrationStatus, Network } from '@prisma/client';

const searchInboxAgentRegistrations = jest.fn();
const updateLatestCardanoRegistryEntries = jest.fn();

jest.mock('@/repositories/inbox-agent-registration', () => ({
  inboxAgentRegistrationRepository: {
    searchInboxAgentRegistrations,
    getInboxAgentRegistrations: jest.fn(),
    getInboxAgentRegistrationDiffEntries: jest.fn(),
  },
}));

jest.mock('@/services/cardano-registry', () => ({
  cardanoRegistryService: {
    updateLatestCardanoRegistryEntries,
  },
}));

import { inboxAgentRegistrationService } from './inbox-agent-registration.service';

describe('inboxAgentRegistrationService.searchInboxAgentRegistrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchInboxAgentRegistrations.mockResolvedValue([]);
    updateLatestCardanoRegistryEntries.mockResolvedValue(undefined);
  });

  it('normalizes the search query for slug matching while preserving the raw name query', async () => {
    await inboxAgentRegistrationService.searchInboxAgentRegistrations({
      network: Network.Preprod,
      limit: 10,
      query: 'Inbox Agent',
    });

    expect(updateLatestCardanoRegistryEntries).toHaveBeenCalled();
    expect(searchInboxAgentRegistrations).toHaveBeenCalledWith({
      nameQuery: 'Inbox Agent',
      agentSlugQuery: 'inbox-agent',
      allowedStatuses: [
        InboxAgentRegistrationStatus.Pending,
        InboxAgentRegistrationStatus.Verified,
      ],
      policyId: undefined,
      cursorId: undefined,
      limit: 10,
      network: Network.Preprod,
    });
  });

  it('passes through explicit status filters for fuzzy search', async () => {
    await inboxAgentRegistrationService.searchInboxAgentRegistrations({
      network: Network.Mainnet,
      limit: 5,
      cursorId: 'cursor-1',
      query: 'agent',
      filter: {
        policyId: 'policy-id',
        status: [InboxAgentRegistrationStatus.Invalid],
      },
    });

    expect(searchInboxAgentRegistrations).toHaveBeenCalledWith({
      nameQuery: 'agent',
      agentSlugQuery: 'agent',
      allowedStatuses: [InboxAgentRegistrationStatus.Invalid],
      policyId: 'policy-id',
      cursorId: 'cursor-1',
      limit: 5,
      network: Network.Mainnet,
    });
  });
});
