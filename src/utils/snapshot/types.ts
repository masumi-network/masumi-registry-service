import { Network, PaymentType, PricingType, Status } from '@prisma/client';

export interface SnapshotMetadata {
  version: '1.0.0';
  exportedAt: string;
  network: Network;
  policyId: string;
  lastTxId: string | null;
  lastCheckedPage: number;
  entryCount: number;
}

export interface SnapshotCapability {
  name: string;
  version: string;
  description: string | null;
}

export interface SnapshotAmount {
  amount: string;
  unit: string;
}

export interface SnapshotFixedPricing {
  amounts: SnapshotAmount[];
}

export interface SnapshotAgentPricing {
  pricingType: PricingType;
  fixedPricing: SnapshotFixedPricing | null;
}

export interface SnapshotExampleOutput {
  name: string;
  mimeType: string;
  url: string;
}

export interface SnapshotEntry {
  assetIdentifier: string;
  name: string;
  apiBaseUrl: string;
  description: string | null;
  image: string;
  tags: string[];
  authorName: string | null;
  authorContactEmail: string | null;
  authorContactOther: string | null;
  authorOrganization: string | null;
  privacyPolicy: string | null;
  termsAndCondition: string | null;
  otherLegal: string | null;
  lastUptimeCheck: string;
  uptimeCount: number;
  uptimeCheckCount: number;
  status: Status;
  statusUpdatedAt: string;
  paymentType: PaymentType;
  metadataVersion: number;
  capability: SnapshotCapability | null;
  agentPricing: SnapshotAgentPricing;
  exampleOutputs: SnapshotExampleOutput[];
}

export interface Snapshot extends SnapshotMetadata {
  entries: SnapshotEntry[];
}

export interface ImportResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  dryRun?: boolean;
  wouldImport?: number;
  imported?: number;
  syncProgress?: {
    lastTxId: string | null;
    lastCheckedPage: number;
  };
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  entryCount?: number;
  error?: string;
}
