import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { z } from '@/utils/zod-openapi';
import { $Enums } from '@prisma/client';
import { registrySourceService } from '@/services/registry-source';

const mapRegistrySourceToOutput = (source: {
  id: string;
  type: $Enums.RegistryEntryType;
  url: string | null;
  policyId: string | null;
  note: string | null;
  lastCheckedPage: number;
  lastTxId: string | null;
  network: $Enums.Network | null;
  RegistrySourceConfig?: { rpcProviderApiKey: string } | null;
}) => ({
  id: source.id,
  type: source.type,
  url: source.url,
  policyId: source.policyId,
  note: source.note,
  latestPage: source.lastCheckedPage,
  latestIdentifier: source.lastTxId,
  rpcProviderApiKey: source.RegistrySourceConfig?.rpcProviderApiKey ?? null,
  network: source.network ?? null,
});

export const getRegistrySourceSchemaInput = z.object({
  cursorId: z.string().max(550).optional(),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
});

export const registrySourceSchemaOutput = z
  .object({
    id: z.string(),
    type: z.nativeEnum($Enums.RegistryEntryType),
    url: z.string().nullable(),
    policyId: z.string().nullable(),
    note: z.string().nullable(),
    latestPage: z.number({ coerce: true }).int().min(0).max(1000000),
    latestIdentifier: z.string().nullable(),
    rpcProviderApiKey: z.string().nullable(),
    network: z.nativeEnum($Enums.Network).nullable(),
  })
  .openapi('RegistrySource');

export const getRegistrySourceSchemaOutput = z.object({
  sources: z.array(registrySourceSchemaOutput),
});

export const queryRegistrySourceEndpointGet =
  adminAuthenticatedEndpointFactory.build({
    method: 'get',
    input: getRegistrySourceSchemaInput,
    output: getRegistrySourceSchemaOutput,
    handler: async ({
      input,
    }: {
      input: z.infer<typeof getRegistrySourceSchemaInput>;
    }) => {
      const data = await registrySourceService.getRegistrySources(
        input.cursorId,
        input.limit
      );
      return {
        sources: data.map(mapRegistrySourceToOutput),
      };
    },
  });

export const addRegistrySourceSchemaInput = z.object({
  type: z.nativeEnum($Enums.RegistryEntryType),
  policyId: z.string(),
  note: z.string().nullable(),
  rpcProviderApiKey: z.string(),
  network: z.nativeEnum($Enums.Network),
});

export const addRegistrySourceEndpointPost =
  adminAuthenticatedEndpointFactory.build({
    method: 'post',
    input: addRegistrySourceSchemaInput,
    output: registrySourceSchemaOutput,
    handler: async ({
      input,
    }: {
      input: z.infer<typeof addRegistrySourceSchemaInput>;
    }) => {
      const result = await registrySourceService.addRegistrySource(input);
      return mapRegistrySourceToOutput({
        ...result,
        RegistrySourceConfig: null,
      });
    },
  });

export const updateRegistrySourceSchemaInput = z.object({
  id: z.string().max(150).optional(),
  note: z.string().nullable().optional(),
  rpcProviderApiKey: z.string().optional(),
});

export const updateRegistrySourceEndpointPatch =
  adminAuthenticatedEndpointFactory.build({
    method: 'patch',
    input: updateRegistrySourceSchemaInput,
    output: registrySourceSchemaOutput,
    handler: async ({
      input,
    }: {
      input: z.infer<typeof updateRegistrySourceSchemaInput>;
    }) => {
      const result = await registrySourceService.updateRegistrySource(input);
      return mapRegistrySourceToOutput({
        ...result,
        RegistrySourceConfig: null,
      });
    },
  });

export const deleteRegistrySourceSchemaInput = z.object({
  id: z.string().max(150),
});

export const deleteRegistrySourceEndpointDelete =
  adminAuthenticatedEndpointFactory.build({
    method: 'delete',
    input: deleteRegistrySourceSchemaInput,
    output: registrySourceSchemaOutput,
    handler: async ({
      input,
    }: {
      input: z.infer<typeof deleteRegistrySourceSchemaInput>;
    }) => {
      const result = await registrySourceService.deleteRegistrySource(input.id);
      return mapRegistrySourceToOutput(result);
    },
  });
