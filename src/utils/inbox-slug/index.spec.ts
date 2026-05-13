import { isReservedInboxSlug, normalizeInboxSlug } from './index';

describe('inbox slug utils', () => {
  it('normalizes inbox slugs using the same canonical rules as Masumi Inbox', () => {
    expect(normalizeInboxSlug(' Agent Démo_One ')).toBe('agent-demo-one');
  });

  it('detects reserved inbox slugs after normalization', () => {
    expect(isReservedInboxSlug('Robots.txt')).toBe(true);
    expect(isReservedInboxSlug('agent-demo')).toBe(false);
  });
});
