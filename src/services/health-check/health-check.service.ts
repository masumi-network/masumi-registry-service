import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import {
  $Enums,
  Capability,
  PricingType,
  RegistryEntry,
  RegistrySource,
} from '@prisma/client';

async function checkAndVerifyEndpoint({ api_url }: { api_url: string }) {
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7500);
    const endpointResponse = await fetch(`${urlString}/availability`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!endpointResponse.ok) {
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
  checkAndVerifyRegistryEntry,
  checkVerifyAndUpdateRegistryEntries,
};
