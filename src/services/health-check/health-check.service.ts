import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import {
  $Enums,
  Capability,
  InboxAgentRegistration,
  InboxAgentRegistrationStatus,
  PricingType,
  RegistryEntry,
  RegistrySource,
} from '@prisma/client';
import {
  PublicUrlValidationError,
  validatePublicUrl,
} from '@/utils/public-url';
import { agentCardSchema } from '@/utils/a2a-schemas';
import { timedFetch } from '@/utils/timed-fetch';

const INBOX_AGENT_PUBLIC_BASE_URLS: Partial<Record<$Enums.Network, string>> = {
  [$Enums.Network.Preprod]:
    'https://agentmessenger-dev-x92rn.ondigitalocean.app/',
  [$Enums.Network.Mainnet]: 'https://app.agentmessenger.io/',
};

const INBOX_AGENT_IDENTIFIER_KEYS = new Set([
  'agentIdentifier',
  'masumiAgentIdentifier',
]);
const INBOX_AGENT_LINKED_EMAIL_KEY = 'linkedEmail';
const INBOX_AGENT_ENCRYPTION_PUBLIC_KEY_KEY = 'encryptionPublicKey';
const INBOX_AGENT_ENCRYPTION_KEY_VERSION_KEY = 'encryptionKeyVersion';
const INBOX_AGENT_SIGNING_PUBLIC_KEY_KEY = 'signingPublicKey';
const INBOX_AGENT_SIGNING_KEY_VERSION_KEY = 'signingKeyVersion';

type InboxAgentVerificationData = {
  linkedEmail: string | null;
  encryptionPublicKey: string | null;
  encryptionKeyVersion: string | null;
  signingPublicKey: string | null;
  signingKeyVersion: string | null;
};

type InboxAgentVerificationDecision = {
  status: InboxAgentRegistrationStatus;
  preserveExistingVerificationData: boolean;
  verificationData: InboxAgentVerificationData;
};

type InboxAgentPublicEndpointResult =
  | {
      outcome: 'resolved';
      returnedAgentIdentifiers: string[];
      verificationData: InboxAgentVerificationData;
    }
  | {
      outcome: 'pending';
      returnedAgentIdentifiers: [];
    }
  | {
      outcome: 'unavailable';
      returnedAgentIdentifiers: [];
    };

type InboxAgentRegistrationWithSource = InboxAgentRegistration & {
  RegistrySource: RegistrySource;
};

function getEmptyInboxAgentVerificationData(): InboxAgentVerificationData {
  return {
    linkedEmail: null,
    encryptionPublicKey: null,
    encryptionKeyVersion: null,
    signingPublicKey: null,
    signingKeyVersion: null,
  };
}

function isUnsafePublicUrl(error: unknown): boolean {
  return (
    error instanceof PublicUrlValidationError &&
    error.code !== 'unresolvable_hostname'
  );
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

function extractInboxAgentPublicVerification(value: unknown): {
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

// ─── Helper: pick the correct health-check URL per entry type ─────────────────
function getHealthCheckKey(entry: {
  metadataVersion: number;
  agentCardUrl: string | null;
  apiBaseUrl: string;
}): { url: string; isA2A: boolean } {
  return entry.metadataVersion === 2 && entry.agentCardUrl
    ? { url: entry.agentCardUrl, isA2A: true }
    : { url: entry.apiBaseUrl, isA2A: false };
}

// ─── MIP-002: check agent card URL ───────────────────────────────────────────
async function checkA2AAgentCard({
  agent_card_url,
}: {
  agent_card_url: string;
}): Promise<{ returnedAgentIdentifier: null; status: $Enums.Status }> {
  try {
    const url = new URL(agent_card_url);
    if (['localhost', '127.0.0.1'].includes(url.hostname)) {
      return { returnedAgentIdentifier: null, status: $Enums.Status.Invalid };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { returnedAgentIdentifier: null, status: $Enums.Status.Invalid };
    }

    const response = await timedFetch(agent_card_url);
    if (!response.ok) {
      try {
        await response.text();
      } catch {
        // drain body
      }
      return { returnedAgentIdentifier: null, status: $Enums.Status.Offline };
    }
    const json = await response.json();
    const parsed = agentCardSchema.safeParse(json);
    return {
      returnedAgentIdentifier: null,
      status: parsed.success ? $Enums.Status.Online : $Enums.Status.Invalid,
    };
  } catch {
    return { returnedAgentIdentifier: null, status: $Enums.Status.Offline };
  }
}

// ─── MIP-001: check /availability endpoint ────────────────────────────────────
async function checkAndVerifyEndpoint({ api_url }: { api_url: string }) {
  let controller: AbortController | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    const { normalizedUrl } = await validatePublicUrl(api_url);
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), 32000);
    const endpointResponse = await fetch(`${normalizedUrl}/availability`, {
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    timeoutId = null;

    if (!endpointResponse.ok) {
      try {
        await endpointResponse.text();
      } catch {
        // Ignore errors when consuming body
      }
      return {
        returnedAgentIdentifier: null,
        status: $Enums.Status.Offline,
      };
    }

    const responseBody = await endpointResponse.json();
    if (responseBody.agentIdentifier && responseBody.agentIdentifier != '') {
      return {
        returnedAgentIdentifier: responseBody.agentIdentifier,
        status: $Enums.Status.Online,
      };
    }

    return {
      returnedAgentIdentifier: null,
      status:
        responseBody.type == 'masumi-agent'
          ? $Enums.Status.Online
          : $Enums.Status.Invalid,
    };
  } catch (error) {
    return {
      returnedAgentIdentifier: null,
      status: isUnsafePublicUrl(error)
        ? $Enums.Status.Invalid
        : $Enums.Status.Offline,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (controller) {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
    }
  }
}

async function checkAndVerifyRegistryEntry({
  registryEntry,
  minHealthCheckDate,
}: {
  registryEntry: {
    assetIdentifier: string;
    lastUptimeCheck: Date;
    apiBaseUrl: string;
    agentCardUrl: string | null;
    metadataVersion: number;
    status: $Enums.Status;
    RegistrySource: { policyId: string };
  };
  minHealthCheckDate: Date | undefined;
}) {
  if (
    registryEntry.lastUptimeCheck.getTime() >
    (minHealthCheckDate?.getTime() ?? 0)
  ) {
    logger.info(
      'Skipping health check for registry entry',
      registryEntry.lastUptimeCheck,
      minHealthCheckDate
    );
    return registryEntry.status;
  }

  // MIP-002: check agent card URL
  if (registryEntry.metadataVersion === 2 && registryEntry.agentCardUrl) {
    const result = await checkA2AAgentCard({
      agent_card_url: registryEntry.agentCardUrl,
    });
    return result.status;
  }

  // MIP-001: check /availability endpoint
  const result = await checkAndVerifyEndpoint({
    api_url: registryEntry.apiBaseUrl,
  });
  if (result.returnedAgentIdentifier != null) {
    return result.returnedAgentIdentifier == registryEntry.assetIdentifier
      ? $Enums.Status.Online
      : $Enums.Status.Invalid;
  }
  return result.status;
}

async function checkVerifyAndUpdateRegistryEntries({
  registryEntries,
  minHealthCheckDate,
}: {
  registryEntries: (RegistryEntry & {
    RegistrySource: RegistrySource;
    Capability: Capability | null;
    tags: string[];
    AgentPricing: {
      pricingType: PricingType;
      FixedPricing: {
        Amounts: { amount: bigint; unit: string }[];
      } | null;
    };
    ExampleOutput: { name: string; mimeType: string; url: string }[];
  })[];
  minHealthCheckDate: Date | undefined;
}) {
  if (minHealthCheckDate == null) return registryEntries;

  const lookupMap = new Map<
    string,
    { status: $Enums.Status; agentIdentifier: string | null }
  >();

  // Build deduplicated lookup map. Key is `${type}:${url}` to prevent a MIP-001
  // apiBaseUrl that coincidentally matches a MIP-002 agentCardUrl from being
  // dispatched to the wrong health checker.
  const neededLookups = new Map<string, { url: string; isA2A: boolean }>();
  for (const entry of registryEntries) {
    const { url, isA2A } = getHealthCheckKey(entry);
    const key = `${isA2A ? 'a2a' : 'mip001'}:${url}`;
    if (!neededLookups.has(key)) {
      neededLookups.set(key, { url, isA2A });
    }
  }

  // Dispatch each URL to the correct health checker
  const completedLookups = await Promise.allSettled(
    Array.from(neededLookups.entries()).map(async ([key, { url, isA2A }]) => {
      const result = isA2A
        ? await checkA2AAgentCard({ agent_card_url: url })
        : await checkAndVerifyEndpoint({ api_url: url });
      return {
        key,
        status: result.status,
        agentIdentifier: result.returnedAgentIdentifier,
      };
    })
  );

  for (const lookup of completedLookups) {
    if (lookup.status === 'fulfilled') {
      lookupMap.set(lookup.value.key, {
        status: lookup.value.status,
        agentIdentifier: lookup.value.agentIdentifier,
      });
    }
  }
  logger.info('completed lookups', {
    count: lookupMap.size,
    total: neededLookups.size,
  });

  const data = await Promise.allSettled(
    registryEntries.map(async (entry) => {
      const registrySource = entry.RegistrySource;
      if (registrySource == null || registrySource.policyId == null) {
        logger.error('registrySource is null', entry);
        throw new Error('registrySource or policyId is null');
      }

      // Use the compound key so A2A and MIP-001 entries are never cross-matched
      const { url: healthCheckUrl, isA2A: entryIsA2A } =
        getHealthCheckKey(entry);
      const lookupKey = `${entryIsA2A ? 'a2a' : 'mip001'}:${healthCheckUrl}`;

      if (lookupMap.has(lookupKey)) {
        const lookup = lookupMap.get(lookupKey)!;
        // agentIdentifier check only applies to MIP-001 (MIP-002 always returns null)
        if (lookup.agentIdentifier != null) {
          return {
            id: entry.id,
            status:
              lookup.agentIdentifier == entry.assetIdentifier
                ? lookup.status
                : $Enums.Status.Invalid,
            assetIdentifier: entry.assetIdentifier,
          };
        }
        return {
          id: entry.id,
          status: lookup.status,
          assetIdentifier: entry.assetIdentifier,
        };
      }

      // Fallback: individual check (used when batch lookup failed for this URL)
      const status = await checkAndVerifyRegistryEntry({
        registryEntry: { ...entry },
        minHealthCheckDate: minHealthCheckDate,
      });
      lookupMap.set(lookupKey, {
        status: status,
        agentIdentifier: null,
      });

      return {
        id: entry.id,
        status: status,
        assetIdentifier: entry.assetIdentifier,
      };
    })
  );
  const failed = data.filter((r) => r.status === 'rejected');
  for (const f of failed) {
    logger.error('failed to update registry entry', {
      error: f.reason.message,
    });
  }
  const successful = data
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  const failedIds = registryEntries
    .map((r) => r.id)
    .filter((r) => !successful.find((s) => s.id === r));

  await prisma.registryEntry.updateMany({
    where: { id: { in: failedIds } },
    data: { status: $Enums.Status.Invalid, lastUptimeCheck: new Date() },
  });

  const updatedEntries = [];
  for (const s of successful) {
    try {
      updatedEntries.push(
        await prisma.registryEntry.update({
          where: { id: s.id },
          include: {
            AgentPricing: {
              include: { FixedPricing: { include: { Amounts: true } } },
            },
            Capability: true,
            RegistrySource: true,
            ExampleOutput: true,
            A2ASkills: true,
            A2ASupportedInterfaces: true,
            A2ACapabilities: true,
          },
          data: {
            status: s.status,
            uptimeCount: {
              increment: s.status == $Enums.Status.Online ? 1 : 0,
            },
            uptimeCheckCount: { increment: 1 },
            lastUptimeCheck: new Date(),
          },
        })
      );
    } catch (e) {
      logger.error('failed to update registry entry in db ', {
        error: e,
        s: s.id,
      });
    }
  }
  logger.info(
    'updated the following registry entries successfully ' +
      successful.length +
      '/' +
      registryEntries.length,
    {
      successful: successful.length,
      failed: failed.length,
      total: registryEntries.length,
    }
  );
  return updatedEntries;
}

async function checkAndVerifyInboxAgentPublicEndpoint(params: {
  network: $Enums.Network;
  agentSlug: string;
  providerUrl?: string | null;
}): Promise<InboxAgentPublicEndpointResult> {
  const configuredBaseUrl =
    params.providerUrl ?? INBOX_AGENT_PUBLIC_BASE_URLS[params.network];
  if (!configuredBaseUrl) {
    return { outcome: 'unavailable', returnedAgentIdentifiers: [] };
  }

  let controller: AbortController | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    const { normalizedUrl } = await validatePublicUrl(configuredBaseUrl);
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), 32000);
    const endpointResponse = await fetch(
      `${normalizedUrl}/${encodeURIComponent(params.agentSlug)}/public`,
      {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    clearTimeout(timeoutId);
    timeoutId = null;

    if (!endpointResponse.ok) {
      const responseStatus = endpointResponse.status;
      try {
        await endpointResponse.text();
      } catch {
        // Ignore response body consumption errors for pending inbox agents
      }
      return responseStatus === 404
        ? { outcome: 'pending', returnedAgentIdentifiers: [] }
        : { outcome: 'unavailable', returnedAgentIdentifiers: [] };
    }

    let responseBody: unknown;
    try {
      responseBody = await endpointResponse.json();
    } catch {
      return { outcome: 'unavailable', returnedAgentIdentifiers: [] };
    }

    const responseData = extractInboxAgentPublicVerification(responseBody);
    if (responseData.returnedAgentIdentifiers.length === 0) {
      return { outcome: 'pending', returnedAgentIdentifiers: [] };
    }

    return {
      outcome: 'resolved',
      returnedAgentIdentifiers: responseData.returnedAgentIdentifiers,
      verificationData: responseData.verificationData,
    };
  } catch {
    return { outcome: 'unavailable', returnedAgentIdentifiers: [] };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (controller) {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
    }
  }
}

async function checkAndVerifyInboxAgentRegistration(params: {
  inboxAgentRegistration: Pick<
    InboxAgentRegistrationWithSource,
    'assetIdentifier' | 'agentSlug'
  > & {
    providerUrl?: string | null;
    RegistrySource: Pick<RegistrySource, 'network'>;
  };
  currentStatus?: InboxAgentRegistrationStatus;
  lookupResult?: InboxAgentPublicEndpointResult;
}): Promise<InboxAgentVerificationDecision> {
  const lookupResult =
    params.lookupResult ??
    (await checkAndVerifyInboxAgentPublicEndpoint({
      network: params.inboxAgentRegistration.RegistrySource.network,
      agentSlug: params.inboxAgentRegistration.agentSlug,
      providerUrl: params.inboxAgentRegistration.providerUrl,
    }));
  const currentStatus =
    params.currentStatus ?? InboxAgentRegistrationStatus.Pending;

  if (lookupResult.outcome === 'unavailable') {
    return {
      status: currentStatus,
      preserveExistingVerificationData: true,
      verificationData: getEmptyInboxAgentVerificationData(),
    };
  }

  if (lookupResult.outcome === 'pending') {
    return {
      status: InboxAgentRegistrationStatus.Pending,
      preserveExistingVerificationData: false,
      verificationData: getEmptyInboxAgentVerificationData(),
    };
  }

  if (
    lookupResult.returnedAgentIdentifiers.includes(
      params.inboxAgentRegistration.assetIdentifier
    )
  ) {
    return {
      status: InboxAgentRegistrationStatus.Verified,
      preserveExistingVerificationData: false,
      verificationData: lookupResult.verificationData,
    };
  }

  return {
    status: InboxAgentRegistrationStatus.Invalid,
    preserveExistingVerificationData: false,
    verificationData: getEmptyInboxAgentVerificationData(),
  };
}

async function checkVerifyAndUpdateInboxAgentRegistrations(params: {
  inboxAgentRegistrations: InboxAgentRegistrationWithSource[];
}) {
  if (params.inboxAgentRegistrations.length === 0) {
    return [];
  }

  const lookupMap = new Map<string, InboxAgentPublicEndpointResult>();
  const neededLookups = new Map<
    string,
    {
      network: $Enums.Network;
      agentSlug: string;
      providerUrl: string | null;
    }
  >();

  for (const registration of params.inboxAgentRegistrations) {
    const lookupKey = `${registration.RegistrySource.network}:${registration.providerUrl ?? ''}:${registration.agentSlug}`;
    if (!neededLookups.has(lookupKey)) {
      neededLookups.set(lookupKey, {
        network: registration.RegistrySource.network,
        agentSlug: registration.agentSlug,
        providerUrl: registration.providerUrl,
      });
    }
  }

  const completedLookups = await Promise.allSettled(
    Array.from(neededLookups.entries()).map(async ([lookupKey, lookup]) => ({
      lookupKey,
      result: await checkAndVerifyInboxAgentPublicEndpoint(lookup),
    }))
  );

  for (const lookup of completedLookups) {
    if (lookup.status === 'fulfilled') {
      lookupMap.set(lookup.value.lookupKey, lookup.value.result);
    }
  }

  logger.info('completed inbox agent lookups', {
    count: lookupMap.size,
    total: neededLookups.size,
  });

  const now = new Date();
  const data = await Promise.allSettled(
    params.inboxAgentRegistrations.map(async (registration) => {
      const lookupKey = `${registration.RegistrySource.network}:${registration.providerUrl ?? ''}:${registration.agentSlug}`;
      const decision = await checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: registration,
        currentStatus: registration.status,
        lookupResult: lookupMap.get(lookupKey) ?? {
          outcome: 'unavailable',
          returnedAgentIdentifiers: [],
        },
      });

      return prisma.inboxAgentRegistration.update({
        where: { id: registration.id },
        include: {
          RegistrySource: true,
        },
        data: {
          status: decision.status,
          linkedEmail: decision.preserveExistingVerificationData
            ? undefined
            : decision.verificationData.linkedEmail,
          encryptionPublicKey: decision.preserveExistingVerificationData
            ? undefined
            : decision.verificationData.encryptionPublicKey,
          encryptionKeyVersion: decision.preserveExistingVerificationData
            ? undefined
            : decision.verificationData.encryptionKeyVersion,
          signingPublicKey: decision.preserveExistingVerificationData
            ? undefined
            : decision.verificationData.signingPublicKey,
          signingKeyVersion: decision.preserveExistingVerificationData
            ? undefined
            : decision.verificationData.signingKeyVersion,
          statusUpdatedAt:
            decision.status !== registration.status ? now : undefined,
        },
      });
    })
  );

  const failed = data.filter((result) => result.status === 'rejected');
  for (const failure of failed) {
    logger.error('failed to update inbox agent registration', {
      error:
        failure.reason instanceof Error
          ? failure.reason.message
          : failure.reason,
    });
  }

  const updatedRegistrations = data
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  logger.info(
    'updated the following inbox agent registrations successfully ' +
      updatedRegistrations.length +
      '/' +
      params.inboxAgentRegistrations.length,
    {
      successful: updatedRegistrations.length,
      failed: failed.length,
      total: params.inboxAgentRegistrations.length,
    }
  );

  return updatedRegistrations;
}

export const healthCheckService = {
  checkAndVerifyEndpoint,
  checkA2AAgentCard,
  checkAndVerifyRegistryEntry,
  checkVerifyAndUpdateRegistryEntries,
  checkAndVerifyInboxAgentRegistration,
  checkVerifyAndUpdateInboxAgentRegistrations,
};
