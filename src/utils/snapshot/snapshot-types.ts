import {
  Network,
  PaymentType,
  PricingType,
  RegistryEntryType,
} from '@prisma/client';

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  version: number;
  exportedAt: string;
  network: Network | null;
  totalEntries: number;
  entries: SnapshotEntry[];
}

export interface SnapshotEntry {
  name: string;
  apiBaseUrl: string;
  description: string | null;
  authorName: string | null;
  authorContactEmail: string | null;
  authorContactOther: string | null;
  authorOrganization: string | null;
  privacyPolicy: string | null;
  termsAndCondition: string | null;
  otherLegal: string | null;
  image: string;
  tags: string[];
  assetIdentifier: string;
  paymentType: PaymentType;
  metadataVersion: number;
  registrySource: SnapshotRegistrySource;
  capability: SnapshotCapability | null;
  pricing: SnapshotPricing;
  agentOutputs: SnapshotAgentOutput[];
}

export interface SnapshotRegistrySource {
  type: RegistryEntryType;
  network: Network | null;
  policyId: string;
}

export interface SnapshotCapability {
  name: string;
  version: string;
  description: string | null;
}

export interface SnapshotPricing {
  type: PricingType;
  amounts: SnapshotPricingAmount[];
}

export interface SnapshotPricingAmount {
  amount: string;
  unit: string;
}

export interface SnapshotAgentOutput {
  name: string;
  mimeType: string;
  url: string;
}

export interface ExportOptions {
  network?: Network;
  output?: string;
  includeInvalid?: boolean;
}

export interface ImportOptions {
  input: string;
  skipExisting?: boolean;
  dryRun?: boolean;
}

export interface ImportStats {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
}
