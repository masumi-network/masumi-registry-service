import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import {
  $Enums,
  AgentVerification,
  Capability,
  HealthCheckTrigger,
  InboxAgentRegistration,
  InboxAgentRegistrationStatus,
  PricingType,
  RegistryEntry,
  RegistrySource,
  SupportedPaymentSource,
} from '@prisma/client';
import {
  PublicUrlValidationError,
  validatePublicUrl,
} from '@/utils/public-url';
import {
  checkSpecEntry,
  specCachePatch,
  specKindForType,
} from './spec-entry-check';
import {
  extractInboxAgentPublicVerification,
  getEmptyInboxAgentVerificationData,
  type InboxAgentVerificationData,
} from './inbox-verification';
import { uptimeCheckUpdate, uptimeTracking } from './uptime-tracking';

const INBOX_AGENT_PUBLIC_BASE_URLS: Partial<Record<$Enums.Network, string>> = {
  [$Enums.Network.Preprod]:
    'https://agentmessenger-dev-x92rn.ondigitalocean.app/',
  [$Enums.Network.Mainnet]: 'https://app.agentmessenger.io/',
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

function isUnsafePublicUrl(error: unknown): boolean {
  return (
    error instanceof PublicUrlValidationError &&
    error.code !== 'unresolvable_hostname'
  );
}

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
  trigger,
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
    } | null;
    ExampleOutput: { name: string; mimeType: string; url: string }[];
    SupportedPaymentSources: (SupportedPaymentSource & {
      Pricing: {
        pricingType: PricingType;
        FixedPricing: {
          Amounts: { amount: bigint; unit: string }[];
        } | null;
      } | null;
    })[];
    Verifications: AgentVerification[];

    A2A: { agentCardUrl: string; protocolVersions: string[] } | null;
  })[];
  minHealthCheckDate: Date | undefined;
  trigger: HealthCheckTrigger;
}) {
  if (minHealthCheckDate == null) return registryEntries;
  // Burned agents stay Deregistered: a still-live endpoint must not revive them.
  const entriesToCheck = registryEntries.filter(
    (entry) => entry.status !== $Enums.Status.Deregistered
  );
  const lookupMap = new Map<
    string,
    { status: $Enums.Status; agentIdentifier: string | null }
  >();
  const neededLookups = new Set<string>();
  for (const entry of entriesToCheck) {
    // Spec-type entries are validated per-entry below, not via this lookup.
    if (specKindForType(entry.type) == null && entry.apiBaseUrl != null) {
      neededLookups.add(entry.apiBaseUrl);
    }
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

  // Entries returned without a probe: their uptime and history stay as is.
  // A status decided without a request (e.g. Invalid for a missing URL) is
  // still an evaluated check and is recorded.
  const uncheckedIds = new Set<string>();
  const data = await Promise.allSettled(
    entriesToCheck.map(async (entry) => {
      const registrySource = entry.RegistrySource;
      if (registrySource == null || registrySource.policyId == null) {
        logger.error('registrySource is null', entry);
        uncheckedIds.add(entry.id);
        return entry;
      }
      if (specKindForType(entry.type) != null) {
        const check = await checkSpecEntry(entry);
        return {
          id: entry.id,
          status: check.status,
          assetIdentifier: entry.assetIdentifier,
          spec: check.spec,
        };
      }
      if (entry.apiBaseUrl != null && lookupMap.has(entry.apiBaseUrl)) {
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
      // Reachable only for Standard entries (spec types returned early), which
      // always carry a non-null apiBaseUrl.
      if (
        entry.lastUptimeCheck.getTime() > (minHealthCheckDate?.getTime() ?? 0)
      ) {
        uncheckedIds.add(entry.id); // recently checked: cached status only
      }
      const status = await checkAndVerifyRegistryEntry({
        registryEntry: { ...entry, apiBaseUrl: entry.apiBaseUrl! },
        minHealthCheckDate,
      });
      lookupMap.set(entry.apiBaseUrl!, {
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

  const checkedAt = new Date();
  const entriesById = new Map(entriesToCheck.map((entry) => [entry.id, entry]));
  const failedEntries = entriesToCheck.filter(
    (entry) => !successful.find((s) => s.id === entry.id)
  );

  // A check that threw counts as Offline, so its interval still feeds uptime.
  for (const entry of failedEntries) {
    await prisma.registryEntry.update({
      where: { id: entry.id },
      data: {
        status: $Enums.Status.Offline,
        ...uptimeCheckUpdate(entry, $Enums.Status.Offline, checkedAt),
      },
    });
  }
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
            SupportedPaymentSources: {
              include: {
                Pricing: {
                  include: {
                    FixedPricing: { include: { Amounts: true } },
                  },
                },
              },
              orderBy: { sourceIndex: 'asc' },
            },
            Verifications: true,
            A2A: true,
          },
          data: {
            status: s.status,
            ...(uncheckedIds.has(s.id)
              ? {}
              : uptimeCheckUpdate(entriesById.get(s.id)!, s.status, checkedAt)),
            ...specCachePatch(s), // caches a just-validated spec snapshot
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
  // Unchecked entries get no event. Events are history only, so a failed
  // write must not fail the check.
  await uptimeTracking
    .recordHealthCheckEvents(
      [
        ...failedEntries.map((entry) => ({
          id: entry.id,
          status: $Enums.Status.Offline,
        })),
        ...updatedEntries,
      ]
        .filter((entry) => !uncheckedIds.has(entry.id))
        .map((entry) => ({
          registryEntryId: entry.id,
          status: entry.status,
          trigger,
          checkedAt,
        }))
    )
    .catch((error) =>
      logger.error('failed to record health check events', { error })
    );
  logger.info(
    'updated the following registry entries successfully ' +
      successful.length +
      '/' +
      entriesToCheck.length,
    {
      successful: successful.length,
      failed: failed.length,
      total: entriesToCheck.length,
    }
  );
  // Input order is kept: ranked listings rely on it.
  const updatedById = new Map(updatedEntries.map((entry) => [entry.id, entry]));
  return registryEntries.flatMap((entry) =>
    entry.status === $Enums.Status.Deregistered
      ? [entry]
      : (updatedById.get(entry.id) ?? [])
  );
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
  checkAndVerifyRegistryEntry,
  checkVerifyAndUpdateRegistryEntries,
  checkAndVerifyInboxAgentRegistration,
  checkVerifyAndUpdateInboxAgentRegistrations,
};
