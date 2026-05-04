import { z } from '@/utils/zod-openapi';
import { ez } from 'express-zod-api';
import { Network, SimpleApiStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const createSimpleApiListingSchemaInput = z.object({
  network: z.nativeEnum(Network),
  url: z.string().url().min(1).max(500),
  name: z.string().min(1).max(250),
  description: z.string().max(500).optional(),
  category: z.string().min(1).max(100).optional(),
  tags: z.array(z.string().min(1).max(100)).max(15).optional(),
});

export const querySimpleApiListingSchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  filter: z
    .object({
      status: z.array(z.nativeEnum(SimpleApiStatus)).max(4).optional(),
      category: z.string().min(1).max(100).optional(),
      tags: z.array(z.string().min(1).max(100)).max(15).optional(),
    })
    .optional(),
});

export const searchSimpleApiListingSchemaInput = z.object({
  network: z.nativeEnum(Network),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(50).optional(),
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      'Case-insensitive search against name, description, category, and URL.'
    ),
  filter: z
    .object({
      status: z.array(z.nativeEnum(SimpleApiStatus)).max(4).optional(),
      category: z.string().min(1).max(100).optional(),
      tags: z.array(z.string().min(1).max(100)).max(15).optional(),
    })
    .optional(),
});

export const diffSimpleApiListingSchemaInput = z.object({
  network: z.nativeEnum(Network),
  statusUpdatedAfter: ez.dateIn(),
  limit: z.number({ coerce: true }).int().min(1).max(50).default(10),
  cursorId: z.string().min(1).max(75).optional(),
});

export const updateSimpleApiListingSchemaInput = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(250).optional(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().min(1).max(100).optional().nullable(),
  tags: z.array(z.string().min(1).max(100)).max(15).optional(),
});

export const deleteSimpleApiListingSchemaInput = z.object({
  id: z.string().min(1).max(50),
});

// ---------------------------------------------------------------------------
// Shared inner schemas
// ---------------------------------------------------------------------------

const x402AcceptSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  maxAmountRequired: z.string(),
  payTo: z.string(),
  asset: z.string(),
  resource: z.string(),
  description: z.string().nullable(),
  mimeType: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Output schema (frozen wire format — see tracker §4)
// ---------------------------------------------------------------------------

export const simpleApiListingSchemaOutput = z
  .object({
    id: z.string(),
    entryType: z.literal('SimpleApi'),
    network: z.nativeEnum(Network),
    name: z.string(),
    description: z.string().nullable(),
    url: z.string(),
    category: z.string().nullable(),
    tags: z.array(z.string()),
    accepts: z.array(x402AcceptSchema),
    extra: z.record(z.unknown()).nullable(),
    httpMethod: z.string().nullable(),
    status: z.nativeEnum(SimpleApiStatus),
    lastActiveAt: z.date().nullable(),
    statusUpdatedAt: z.date(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi('SimpleApiListing');

export const querySimpleApiListingSchemaOutput = z.object({
  listings: z.array(simpleApiListingSchemaOutput),
});

export const createSimpleApiListingSchemaOutput = z.object({
  listing: simpleApiListingSchemaOutput,
});

export const updateSimpleApiListingSchemaOutput = z.object({
  listing: simpleApiListingSchemaOutput,
});

export const deleteSimpleApiListingSchemaOutput = z.object({
  id: z.string(),
});

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

type SimpleApiListingRow = {
  id: string;
  network: Network;
  name: string;
  description: string | null;
  url: string;
  category: string | null;
  tags: string[];
  rawAccepts: unknown;
  extra: unknown;
  httpMethod: string | null;
  status: SimpleApiStatus;
  lastActiveAt: Date | null;
  statusUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeSimpleApiListing(
  row: SimpleApiListingRow
): z.infer<typeof simpleApiListingSchemaOutput> {
  let accepts: z.infer<typeof x402AcceptSchema>[] = [];
  if (Array.isArray(row.rawAccepts)) {
    accepts = (row.rawAccepts as Record<string, unknown>[]).map((a) => ({
      scheme: String(a['scheme'] ?? ''),
      network: String(a['network'] ?? ''),
      maxAmountRequired: String(a['maxAmountRequired'] ?? ''),
      payTo: String(a['payTo'] ?? ''),
      asset: String(a['asset'] ?? ''),
      resource: String(a['resource'] ?? ''),
      description: a['description'] != null ? String(a['description']) : null,
      mimeType: a['mimeType'] != null ? String(a['mimeType']) : null,
    }));
  }

  return {
    id: row.id,
    entryType: 'SimpleApi' as const,
    network: row.network,
    name: row.name,
    description: row.description,
    url: row.url,
    category: row.category,
    tags: row.tags,
    accepts,
    extra:
      row.extra != null && typeof row.extra === 'object'
        ? (row.extra as Record<string, unknown>)
        : null,
    httpMethod: row.httpMethod,
    status: row.status,
    lastActiveAt: row.lastActiveAt,
    statusUpdatedAt: row.statusUpdatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeSimpleApiListings(
  rows: SimpleApiListingRow[]
): z.infer<typeof simpleApiListingSchemaOutput>[] {
  return rows.map(serializeSimpleApiListing);
}
