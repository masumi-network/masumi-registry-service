import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import {
  $Enums,
  Capability,
  PricingType,
  RegistryEntry,
  RegistrySource,
} from '@prisma/client';
import { agentCardSchema } from '@/utils/a2a-schemas';
import { timedFetch } from '@/utils/timed-fetch';

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

// ─── MIP-001: check /availability endpoint ────────────────────────────────────
async function checkAndVerifyEndpoint({ api_url }: { api_url: string }) {
  try {
    const url = new URL(api_url);
    if (
      ['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.search !== ''
    ) {
      return { returnedAgentIdentifier: null, status: $Enums.Status.Invalid };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { returnedAgentIdentifier: null, status: $Enums.Status.Invalid };
    }

    let urlString = url.toString();
    if (urlString.endsWith('/')) urlString = urlString.slice(0, -1);

    const endpointResponse = await timedFetch(`${urlString}/availability`);
    if (!endpointResponse.ok) {
      try {
        await endpointResponse.text();
      } catch {
        // drain body
      }
      return { returnedAgentIdentifier: null, status: $Enums.Status.Offline };
    }

    const responseBody = await endpointResponse.json();
    if (responseBody.agentIdentifier && responseBody.agentIdentifier !== '') {
      return {
        returnedAgentIdentifier: responseBody.agentIdentifier,
        status: $Enums.Status.Online,
      };
    }
    return {
      returnedAgentIdentifier: null,
      status:
        responseBody.type === 'masumi-agent'
          ? $Enums.Status.Online
          : $Enums.Status.Invalid,
    };
  } catch {
    return { returnedAgentIdentifier: null, status: $Enums.Status.Offline };
  }
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

// ─── Individual entry check (fallback path) ───────────────────────────────────
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
    RegistrySource: { policyId: string; type: $Enums.RegistryEntryType };
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

// ─── Batch health check + DB update ──────────────────────────────────────────
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

export const healthCheckService = {
  checkAndVerifyEndpoint,
  checkA2AAgentCard,
  checkAndVerifyRegistryEntry,
  checkVerifyAndUpdateRegistryEntries,
};
