// Extraction of inbox-agent verification data from an inbox agent's public
// endpoint payload. Kept separate from health-check.service so that file stays
// focused on the check/reconcile orchestration.

const INBOX_AGENT_IDENTIFIER_KEYS = new Set([
  'agentIdentifier',
  'masumiAgentIdentifier',
]);
const INBOX_AGENT_LINKED_EMAIL_KEY = 'linkedEmail';
const INBOX_AGENT_ENCRYPTION_PUBLIC_KEY_KEY = 'encryptionPublicKey';
const INBOX_AGENT_ENCRYPTION_KEY_VERSION_KEY = 'encryptionKeyVersion';
const INBOX_AGENT_SIGNING_PUBLIC_KEY_KEY = 'signingPublicKey';
const INBOX_AGENT_SIGNING_KEY_VERSION_KEY = 'signingKeyVersion';

export type InboxAgentVerificationData = {
  linkedEmail: string | null;
  encryptionPublicKey: string | null;
  encryptionKeyVersion: string | null;
  signingPublicKey: string | null;
  signingKeyVersion: string | null;
};

export function getEmptyInboxAgentVerificationData(): InboxAgentVerificationData {
  return {
    linkedEmail: null,
    encryptionPublicKey: null,
    encryptionKeyVersion: null,
    signingPublicKey: null,
    signingKeyVersion: null,
  };
}

function collectStringValues(value: unknown, foundValues: Set<string>): void {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue) {
      foundValues.add(trimmedValue);
    }
    return;
  }

  if (!Array.isArray(value)) {
    return;
  }

  for (const item of value) {
    collectStringValues(item, foundValues);
  }
}

function collectInboxVerificationStrings(
  value: unknown,
  bucket: Record<string, Set<string>>,
  visitedObjects: WeakSet<object>
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectInboxVerificationStrings(item, bucket, visitedObjects);
    }
    return;
  }

  if (value == null || typeof value !== 'object') {
    return;
  }

  if (visitedObjects.has(value)) {
    return;
  }
  visitedObjects.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (bucket[key] != null) {
      collectStringValues(nestedValue, bucket[key]);
    }

    collectInboxVerificationStrings(nestedValue, bucket, visitedObjects);
  }
}

function getFirstCollectedString(
  bucket: Record<string, Set<string>>,
  key: string
): string | null {
  const values = bucket[key];
  if (values == null || values.size === 0) {
    return null;
  }

  return Array.from(values)[0] ?? null;
}

export function extractInboxAgentPublicVerification(value: unknown): {
  returnedAgentIdentifiers: string[];
  verificationData: InboxAgentVerificationData;
} {
  const bucket: Record<string, Set<string>> = {
    agentIdentifier: new Set<string>(),
    masumiAgentIdentifier: new Set<string>(),
    [INBOX_AGENT_LINKED_EMAIL_KEY]: new Set<string>(),
    [INBOX_AGENT_ENCRYPTION_PUBLIC_KEY_KEY]: new Set<string>(),
    [INBOX_AGENT_ENCRYPTION_KEY_VERSION_KEY]: new Set<string>(),
    [INBOX_AGENT_SIGNING_PUBLIC_KEY_KEY]: new Set<string>(),
    [INBOX_AGENT_SIGNING_KEY_VERSION_KEY]: new Set<string>(),
  };

  collectInboxVerificationStrings(value, bucket, new WeakSet<object>());

  const returnedAgentIdentifiers = Array.from(
    new Set(
      Array.from(INBOX_AGENT_IDENTIFIER_KEYS).flatMap((key) =>
        Array.from(bucket[key] ?? [])
      )
    )
  );

  return {
    returnedAgentIdentifiers,
    verificationData: {
      linkedEmail: getFirstCollectedString(
        bucket,
        INBOX_AGENT_LINKED_EMAIL_KEY
      ),
      encryptionPublicKey: getFirstCollectedString(
        bucket,
        INBOX_AGENT_ENCRYPTION_PUBLIC_KEY_KEY
      ),
      encryptionKeyVersion: getFirstCollectedString(
        bucket,
        INBOX_AGENT_ENCRYPTION_KEY_VERSION_KEY
      ),
      signingPublicKey: getFirstCollectedString(
        bucket,
        INBOX_AGENT_SIGNING_PUBLIC_KEY_KEY
      ),
      signingKeyVersion: getFirstCollectedString(
        bucket,
        INBOX_AGENT_SIGNING_KEY_VERSION_KEY
      ),
    },
  };
}
