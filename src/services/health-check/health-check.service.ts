import { prisma } from '@/utils/db';
import { logger } from '@/utils/logger';
import {
  $Enums,
  Capability,
  PricingType,
  RegistryEntry,
  RegistrySource,
} from '@prisma/client';

async function checkAndVerifyEndpoint({
  api_url,
  assetIdentifier,
}: {
  api_url: string;
  assetIdentifier: string;
}) {
  try {
    const invalidHostname = ['localhost', '127.0.0.1'];
    const url = new URL(api_url);
    if (invalidHostname.includes(url.hostname)) {
      return $Enums.Status.Invalid;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return $Enums.Status.Invalid;
    }

    if (url.search != '') {
      return $Enums.Status.Invalid;
    }
    let urlString = url.toString();
    if (urlString.endsWith('/')) {
      urlString = urlString.slice(0, -1);
    }
    const endpointResponse = await fetch(`${urlString}/availability`);
    if (!endpointResponse.ok) {
      //if the endpoint is offline, we probably want to do some later on checks if it is back up again
      return $Enums.Status.Offline;
    }

    const responseBody = await endpointResponse.json();
    //we need to verify the registry points to the correct url to prevent a later registry providing a wrong payment address
    //if the registry is wrong, we usually want to invalidate the entry in the database and exclude it from further checks

    return responseBody.agentIdentifier === assetIdentifier ||
      responseBody.type == 'masumi-agent'
      ? $Enums.Status.Online
      : $Enums.Status.Invalid;
  } catch {
    return $Enums.Status.Offline;
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
      'returning early',
      registryEntry.lastUptimeCheck,
      minHealthCheckDate
    );
    return registryEntry.status;
  }

  return await checkAndVerifyEndpoint({
    api_url: registryEntry.apiBaseUrl,
    assetIdentifier: registryEntry.assetIdentifier,
  });
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

  const data = await Promise.allSettled(
    registryEntries.map(async (entry) => {
      const registrySource = entry.RegistrySource;
      if (registrySource == null || registrySource.policyId == null) {
        logger.error('registrySource is null', entry);
        return entry;
      }
      const status = await checkAndVerifyRegistryEntry({
        registryEntry: {
          ...entry,
        },
        minHealthCheckDate: minHealthCheckDate,
      });
      return await prisma.registryEntry.update({
        where: { id: entry.id },
        //select all fields
        include: {
          AgentPricing: {
            include: { FixedPricing: { include: { Amounts: true } } },
          },
          Capability: true,
          RegistrySource: true,
          PaymentIdentifier: true,
        },
        data: {
          status,
          uptimeCount: { increment: status == $Enums.Status.Online ? 1 : 0 },
          uptimeCheckCount: { increment: 1 },
          lastUptimeCheck: new Date(),
        },
      });
    })
  );
  return data.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

export const healthCheckService = {
  checkAndVerifyEndpoint,
  checkAndVerifyRegistryEntry,
  checkVerifyAndUpdateRegistryEntries,
};
