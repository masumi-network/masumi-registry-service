import { Network, PaymentType, PricingType, Status } from '@prisma/client';

export const SNAPSHOT_VERSION = '2.0.0' as const;

interface SnapshotMetadata {
  version: typeof SNAPSHOT_VERSION;
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

interface SnapshotFixedPricing {
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
  // Null for OpenApi/X402 entries (they advertise a spec/manifest URL instead).
  apiBaseUrl: string | null;
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
  agentPricing: SnapshotAgentPricing | null;
  exampleOutputs: SnapshotExampleOutput[];
}

export interface Snapshot extends SnapshotMetadata {
  entries: SnapshotEntry[];
}

// V2 registry entry payment source (SupportedPaymentSource row), stored in a
// companion `{network}_{policyId}.payment-sources.json` file rather than inline,
// so V1 entry snapshots stay untouched.
export interface SnapshotSupportedPaymentSource {
  chain: string;
  network: string;
  sourceIndex: number;
  paymentSourceType: string | null;
  address: string;
  scheme: string | null;
  pricing:
    | {
        pricingType: 'Fixed';
        fixed: Array<{ asset: string; amount: string; decimals?: number }>;
      }
    | {
        pricingType: 'Dynamic';
        dynamic?: Array<{ asset: string; decimals: number }>;
      }
    | { pricingType: 'Free' };
  payTo: string | null;
  resource: string | null;
  extra?: unknown; // Prisma Json, passed through verbatim
}

// Payment sources for one entry, keyed by its stable assetIdentifier so the
// companion file can be matched back to entries on import.
export interface SnapshotEntryPaymentSources {
  assetIdentifier: string;
  sources: SnapshotSupportedPaymentSource[];
}

// The companion payment-sources file. Only written when at least one entry in
// the source carries payment sources.
export interface PaymentSourcesSnapshot {
  version: typeof SNAPSHOT_VERSION;
  exportedAt: string;
  network: Network;
  policyId: string;
  entryCount: number; // entries that carry payment sources
  sourceCount: number; // total payment source rows
  entries: SnapshotEntryPaymentSources[];
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
