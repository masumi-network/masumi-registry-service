import { InboxAgentRegistrationStatus } from '@prisma/client';
import {
  hasInboxAgentRegistrationContentChanged,
  nextInboxAgentRegistrationStatus,
  normalizeInboxAgentRegistrationMetadata,
  parseInboxAgentRegistrationMetadata,
} from './inbox-agent-registration';

describe('inbox agent registration helpers', () => {
  it('parses minimal valid metadata', () => {
    expect(
      parseInboxAgentRegistrationMetadata({
        name: 'Inbox Agent',
        agentslug: 'inbox-agent',
        metadata_version: 1,
      })
    ).toEqual({
      name: 'Inbox Agent',
      description: null,
      agentSlug: 'inbox-agent',
      metadataVersion: 1,
    });
  });

  it('normalizes chunked metadata strings', () => {
    expect(
      normalizeInboxAgentRegistrationMetadata({
        name: ['Inbox ', 'Agent'],
        description: ['hello ', 'world'],
        agentslug: 'inbox-agent',
        metadata_version: 1,
      })
    ).toEqual({
      name: 'Inbox Agent',
      description: 'hello world',
      agentSlug: 'inbox-agent',
      metadataVersion: 1,
    });
  });

  it('rejects non-canonical or reserved slugs', () => {
    expect(
      parseInboxAgentRegistrationMetadata({
        name: 'Inbox Agent',
        agentslug: 'Inbox Agent',
        metadata_version: 1,
      })
    ).toBeNull();

    expect(
      parseInboxAgentRegistrationMetadata({
        name: 'Inbox Agent',
        agentslug: 'robots.txt',
        metadata_version: 1,
      })
    ).toBeNull();
  });

  it('detects content changes using normalized fields', () => {
    expect(
      hasInboxAgentRegistrationContentChanged(
        {
          name: 'Inbox Agent',
          description: null,
          agentSlug: 'inbox-agent',
        },
        {
          name: 'Inbox Agent',
          description: 'Updated',
          agentSlug: 'inbox-agent',
        }
      )
    ).toBe(true);
  });

  it('preserves verified and invalid states when content is unchanged', () => {
    expect(
      nextInboxAgentRegistrationStatus({
        currentStatus: InboxAgentRegistrationStatus.Verified,
        changed: false,
      })
    ).toBe(InboxAgentRegistrationStatus.Verified);

    expect(
      nextInboxAgentRegistrationStatus({
        currentStatus: InboxAgentRegistrationStatus.Invalid,
        changed: false,
      })
    ).toBe(InboxAgentRegistrationStatus.Invalid);
  });

  it('resets manual-review states back to pending when content changes', () => {
    expect(
      nextInboxAgentRegistrationStatus({
        currentStatus: InboxAgentRegistrationStatus.Verified,
        changed: true,
      })
    ).toBe(InboxAgentRegistrationStatus.Pending);

    expect(
      nextInboxAgentRegistrationStatus({
        currentStatus: InboxAgentRegistrationStatus.Deregistered,
        changed: false,
      })
    ).toBe(InboxAgentRegistrationStatus.Pending);
  });
});
