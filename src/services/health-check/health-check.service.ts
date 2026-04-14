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

const INBOX_AGENT_PUBLIC_BASE_URLS: Partial<Record<$Enums.Network, string>> = {
  [$Enums.Network.Preprod]: 'https://masumi-inbox-dev-ivi44.ondigitalocean.app',
  [$Enums.Network.Mainnet]: 'https://agentmessenger.io',
};

const INBOX_AGENT_IDENTIFIER_KEYS = new Set([
  'agentIdentifier',
  'masumiAgentIdentifier',
]);

function collectIdentifierValues(
  value: unknown,
  foundIdentifiers: Set<string>
): void {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue) {
      foundIdentifiers.add(trimmedValue);
    }
    return;
  }

  if (!Array.isArray(value)) {
    return;
  }

  for (const item of value) {
    collectIdentifierValues(item, foundIdentifiers);
  }
}

function collectInboxAgentIdentifiers(
  value: unknown,
  foundIdentifiers: Set<string>,
  visitedObjects: WeakSet<object>
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectInboxAgentIdentifiers(item, foundIdentifiers, visitedObjects);
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
    if (INBOX_AGENT_IDENTIFIER_KEYS.has(key)) {
      collectIdentifierValues(nestedValue, foundIdentifiers);
    }

    collectInboxAgentIdentifiers(nestedValue, foundIdentifiers, visitedObjects);
  }
}

function extractInboxAgentIdentifiers(value: unknown): string[] {
  const foundIdentifiers = new Set<string>();
  collectInboxAgentIdentifiers(value, foundIdentifiers, new WeakSet<object>());
  return Array.from(foundIdentifiers);
}

async function checkAndVerifyEndpoint({ api_url }: { api_url: string }) {
  let controller: AbortController | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    const invalidHostname = ['localhost', '127.0.0.1'];
    const url = new URL(api_url);
    if (invalidHostname.includes(url.hostname)) {
      return {
        returnedAgentIdentifier: null,
        status: $Enums.Status.Invalid,
      };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return {
        returnedAgentIdentifier: null,
        status: $Enums.Status.Invalid,
      };
    }

    if (url.search != '') {
      return {
        returnedAgentIdentifier: null,
        status: $Enums.Status.Invalid,
      };
    }
    let urlString = url.toString();
    if (urlString.endsWith('/')) {
      urlString = urlString.slice(0, -1);
    }
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), 7500);
    const endpointResponse = await fetch(`${urlString}/availability`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    timeoutId = null;

    if (!endpointResponse.ok) {
      // Consume the response body to allow connection reuse and prevent memory leaks
      try {
        await endpointResponse.text();
      } catch {
        // Ignore errors when consuming body
      }
      //if the endpoint is offline, we probably want to do some later on checks if it is back up again
      return {
        returnedAgentIdentifier: null,
        status: $Enums.Status.Offline,
      };
    }

    const responseBody = await endpointResponse.json();
    //we need to verify the registry points to the correct url to prevent a later registry providing a wrong payment address
    //if the registry is wrong, we usually want to invalidate the entry in the database and exclude it from further checks
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
  } catch {
    return {
      returnedAgentIdentifier: null,
      status: $Enums.Status.Offline,
    };
  } finally {
    // Ensure cleanup of abort controller and timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (controller) {
      // Abort any pending request to free resources
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
  const neededLookups = new Set<string>();
  for (const entry of registryEntries) {
    neededLookups.add(entry.apiBaseUrl);
  }

  const completedLookups = await Promise.allSettled(
    Array.from(neededLookups).map(async (url) => {
      const result = await checkAndVerifyEndpoint({
        api_url: url,
      });
      return {
        url,
        status: result.status,
        agentIdentifier: result.returnedAgentIdentifier,
      };
    })
  );
  for (const lookup of completedLookups) {
    if (lookup.status === 'fulfilled') {
      lookupMap.set(lookup.value.url, {
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
        return entry;
      }
      if (lookupMap.has(entry.apiBaseUrl)) {
        const lookup = lookupMap.get(entry.apiBaseUrl)!;
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
      const status = await checkAndVerifyRegistryEntry({
        registryEntry: {
          ...entry,
        },
        minHealthCheckDate: minHealthCheckDate,
      });
      lookupMap.set(entry.apiBaseUrl, {
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

  for (const f of failedIds) {
    await prisma.registryEntry.update({
      where: { id: f },
      data: { status: $Enums.Status.Invalid },
    });
  }

  await prisma.registryEntry.updateMany({
    where: { id: { in: failedIds } },
    data: { lastUptimeCheck: new Date(), status: $Enums.Status.Offline },
  });
  const updatedEntries = [];
  for (const s of successful) {
    try {
      updatedEntries.push(
        await prisma.registryEntry.update({
          where: { id: s.id },
          //select all fields
          include: {
            AgentPricing: {
              include: { FixedPricing: { include: { Amounts: true } } },
            },
            Capability: true,
            RegistrySource: true,
            ExampleOutput: true,
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

type InboxAgentRegistrationWithSource = InboxAgentRegistration & {
  RegistrySource: RegistrySource;
};

async function checkAndVerifyInboxAgentPublicEndpoint(params: {
  network: $Enums.Network;
  agentSlug: string;
}): Promise<{ returnedAgentIdentifiers: string[] }> {
  const baseUrl = INBOX_AGENT_PUBLIC_BASE_URLS[params.network];
  if (!baseUrl) {
    return { returnedAgentIdentifiers: [] };
  }

  let controller: AbortController | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), 7500);
    const endpointResponse = await fetch(
      `${baseUrl}/${encodeURIComponent(params.agentSlug)}/public`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    clearTimeout(timeoutId);
    timeoutId = null;

    if (!endpointResponse.ok) {
      try {
        await endpointResponse.text();
      } catch {
        // Ignore response body consumption errors for pending inbox agents
      }
      return { returnedAgentIdentifiers: [] };
    }

    let responseBody: unknown;
    try {
      responseBody = await endpointResponse.json();
    } catch {
      return { returnedAgentIdentifiers: [] };
    }

    return {
      returnedAgentIdentifiers: extractInboxAgentIdentifiers(responseBody),
    };
  } catch {
    return { returnedAgentIdentifiers: [] };
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
    RegistrySource: Pick<RegistrySource, 'network'>;
  };
  returnedAgentIdentifiers?: string[];
}) {
  const returnedAgentIdentifiers =
    params.returnedAgentIdentifiers ??
    (
      await checkAndVerifyInboxAgentPublicEndpoint({
        network: params.inboxAgentRegistration.RegistrySource.network,
        agentSlug: params.inboxAgentRegistration.agentSlug,
      })
    ).returnedAgentIdentifiers;

  if (returnedAgentIdentifiers.length === 0) {
    return InboxAgentRegistrationStatus.Pending;
  }

  return returnedAgentIdentifiers.includes(
    params.inboxAgentRegistration.assetIdentifier
  )
    ? InboxAgentRegistrationStatus.Verified
    : InboxAgentRegistrationStatus.Invalid;
}

async function checkVerifyAndUpdateInboxAgentRegistrations(params: {
  inboxAgentRegistrations: InboxAgentRegistrationWithSource[];
}) {
  if (params.inboxAgentRegistrations.length === 0) {
    return [];
  }

  const lookupMap = new Map<string, string[]>();
  const neededLookups = new Map<
    string,
    { network: $Enums.Network; agentSlug: string }
  >();

  for (const registration of params.inboxAgentRegistrations) {
    const lookupKey = `${registration.RegistrySource.network}:${registration.agentSlug}`;
    if (!neededLookups.has(lookupKey)) {
      neededLookups.set(lookupKey, {
        network: registration.RegistrySource.network,
        agentSlug: registration.agentSlug,
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
      lookupMap.set(
        lookup.value.lookupKey,
        lookup.value.result.returnedAgentIdentifiers
      );
    }
  }

  logger.info('completed inbox agent lookups', {
    count: lookupMap.size,
    total: neededLookups.size,
  });

  const now = new Date();
  const data = await Promise.allSettled(
    params.inboxAgentRegistrations.map(async (registration) => {
      const lookupKey = `${registration.RegistrySource.network}:${registration.agentSlug}`;
      const returnedAgentIdentifiers = lookupMap.get(lookupKey) ?? [];
      const status = await checkAndVerifyInboxAgentRegistration({
        inboxAgentRegistration: registration,
        returnedAgentIdentifiers,
      });

      return prisma.inboxAgentRegistration.update({
        where: { id: registration.id },
        include: {
          RegistrySource: true,
        },
        data: {
          status,
          statusUpdatedAt: status !== registration.status ? now : undefined,
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
  checkAndVerifyRegistryEntry,
  checkVerifyAndUpdateRegistryEntries,
  checkAndVerifyInboxAgentRegistration,
  checkVerifyAndUpdateInboxAgentRegistrations,
};
