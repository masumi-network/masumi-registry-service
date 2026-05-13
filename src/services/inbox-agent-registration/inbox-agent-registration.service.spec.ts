import { InboxAgentRegistrationStatus, Network } from '@prisma/client';

const searchInboxAgentRegistrations = jest.fn();
const getInboxAgentRegistrationByIdentifier = jest.fn();
const resetInvalidInboxAgentRegistrationForRefresh = jest.fn();
const updateLatestCardanoRegistryEntries = jest.fn();
const checkVerifyAndUpdateInboxAgentRegistrations = jest.fn();

jest.mock('@/repositories/inbox-agent-registration', () => ({
  inboxAgentRegistrationRepository: {
    searchInboxAgentRegistrations,
    getInboxAgentRegistrations: jest.fn(),
    getInboxAgentRegistrationByIdentifier,
    resetInvalidInboxAgentRegistrationForRefresh,
    getInboxAgentRegistrationDiffEntries: jest.fn(),
  },
}));

jest.mock('@/services/cardano-registry', () => ({
  cardanoRegistryService: {
    updateLatestCardanoRegistryEntries,
  },
}));

jest.mock('@/services/health-check', () => ({
  healthCheckService: {
    checkVerifyAndUpdateInboxAgentRegistrations,
  },
}));

import { inboxAgentRegistrationService } from './inbox-agent-registration.service';

describe('inboxAgentRegistrationService.searchInboxAgentRegistrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchInboxAgentRegistrations.mockResolvedValue([]);
    updateLatestCardanoRegistryEntries.mockResolvedValue(undefined);
  });

  it('normalizes the search query for slug matching while preserving raw name and email queries', async () => {
    await inboxAgentRegistrationService.searchInboxAgentRegistrations({
      network: Network.Preprod,
      limit: 10,
      query: 'Inbox Agent',
    });

    expect(updateLatestCardanoRegistryEntries).toHaveBeenCalled();
    expect(searchInboxAgentRegistrations).toHaveBeenCalledWith({
      nameQuery: 'Inbox Agent',
      agentSlugQuery: 'inbox-agent',
      linkedEmailQuery: 'Inbox Agent',
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

  it('passes through explicit status filters and email search text', async () => {
    await inboxAgentRegistrationService.searchInboxAgentRegistrations({
      network: Network.Mainnet,
      limit: 5,
      cursorId: 'cursor-1',
      query: 'agent@example.com',
      filter: {
        policyId: 'policy-id',
        status: [InboxAgentRegistrationStatus.Invalid],
      },
    });

    expect(searchInboxAgentRegistrations).toHaveBeenCalledWith({
      nameQuery: 'agent@example.com',
      agentSlugQuery: 'agent-example-com',
      linkedEmailQuery: 'agent@example.com',
      allowedStatuses: [InboxAgentRegistrationStatus.Invalid],
      policyId: 'policy-id',
      cursorId: 'cursor-1',
      limit: 5,
      network: Network.Mainnet,
    });
  });
});

describe('inboxAgentRegistrationService.refreshInboxAgentRegistration', () => {
  const invalidRegistration = {
    id: 'registration-1',
    status: InboxAgentRegistrationStatus.Invalid,
    assetIdentifier: 'asset-1',
    agentSlug: 'inbox-agent',
    providerUrl: null,
    RegistrySource: {
      id: 'source-1',
      policyId: 'policy-id',
      url: null,
      network: Network.Preprod,
    },
  };

  const resetRegistration = {
    ...invalidRegistration,
    status: InboxAgentRegistrationStatus.Pending,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    updateLatestCardanoRegistryEntries.mockResolvedValue(undefined);
    getInboxAgentRegistrationByIdentifier.mockResolvedValue(
      invalidRegistration
    );
    resetInvalidInboxAgentRegistrationForRefresh.mockResolvedValue(
      resetRegistration
    );
    checkVerifyAndUpdateInboxAgentRegistrations.mockResolvedValue([
      {
        ...resetRegistration,
        status: InboxAgentRegistrationStatus.Verified,
      },
    ]);
  });

  it('resets invalid registrations before refreshing inbox verification', async () => {
    const result =
      await inboxAgentRegistrationService.refreshInboxAgentRegistration({
        network: Network.Preprod,
        agentIdentifier: 'asset-1',
      });

    expect(updateLatestCardanoRegistryEntries).toHaveBeenCalled();
    expect(getInboxAgentRegistrationByIdentifier).toHaveBeenCalledWith({
      network: Network.Preprod,
      agentIdentifier: 'asset-1',
    });
    expect(resetInvalidInboxAgentRegistrationForRefresh).toHaveBeenCalledWith({
      id: 'registration-1',
    });
    expect(checkVerifyAndUpdateInboxAgentRegistrations).toHaveBeenCalledWith({
      inboxAgentRegistrations: [resetRegistration],
    });
    expect(result).toMatchObject({
      id: 'registration-1',
      status: InboxAgentRegistrationStatus.Verified,
    });
  });

  it('refreshes non-invalid registrations without resetting verification data', async () => {
    getInboxAgentRegistrationByIdentifier.mockResolvedValue({
      ...invalidRegistration,
      status: InboxAgentRegistrationStatus.Pending,
    });

    await inboxAgentRegistrationService.refreshInboxAgentRegistration({
      network: Network.Preprod,
      agentIdentifier: 'asset-1',
    });

    expect(resetInvalidInboxAgentRegistrationForRefresh).not.toHaveBeenCalled();
    expect(checkVerifyAndUpdateInboxAgentRegistrations).toHaveBeenCalledWith({
      inboxAgentRegistrations: [
        {
          ...invalidRegistration,
          status: InboxAgentRegistrationStatus.Pending,
        },
      ],
    });
  });

  it('returns null when the requested inbox registration does not exist', async () => {
    getInboxAgentRegistrationByIdentifier.mockResolvedValue(null);

    const result =
      await inboxAgentRegistrationService.refreshInboxAgentRegistration({
        network: Network.Preprod,
        agentIdentifier: 'missing-asset',
      });

    expect(result).toBeNull();
    expect(resetInvalidInboxAgentRegistrationForRefresh).not.toHaveBeenCalled();
    expect(checkVerifyAndUpdateInboxAgentRegistrations).not.toHaveBeenCalled();
  });

  it('does not refresh deregistered inbox registrations', async () => {
    getInboxAgentRegistrationByIdentifier.mockResolvedValue({
      ...invalidRegistration,
      status: InboxAgentRegistrationStatus.Deregistered,
    });

    const result =
      await inboxAgentRegistrationService.refreshInboxAgentRegistration({
        network: Network.Preprod,
        agentIdentifier: 'asset-1',
      });

    expect(result).toMatchObject({
      id: 'registration-1',
      status: InboxAgentRegistrationStatus.Deregistered,
    });
    expect(resetInvalidInboxAgentRegistrationForRefresh).not.toHaveBeenCalled();
    expect(checkVerifyAndUpdateInboxAgentRegistrations).not.toHaveBeenCalled();
  });
});
