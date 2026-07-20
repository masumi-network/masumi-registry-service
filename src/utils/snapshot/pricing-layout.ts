import type { PaymentSourcesSnapshot, Snapshot } from './types';

export function validateSnapshotPricingLayout(
  snapshot: Snapshot,
  paymentSources: PaymentSourcesSnapshot | null
): void {
  const sourceEntryByAsset = new Map(
    (paymentSources?.entries ?? []).map((entry) => [
      entry.assetIdentifier,
      entry,
    ])
  );
  if (sourceEntryByAsset.size !== (paymentSources?.entries.length ?? 0)) {
    throw new Error(
      'Payment-sources file contains duplicate registry entry identifiers'
    );
  }

  for (const paymentEntry of paymentSources?.entries ?? []) {
    if (paymentEntry.sources.length === 0) {
      throw new Error(
        `Payment-sources entry ${paymentEntry.assetIdentifier} must contain at least one source`
      );
    }
    const indexes = new Set(
      paymentEntry.sources.map((source) => source.sourceIndex)
    );
    if (indexes.size !== paymentEntry.sources.length) {
      throw new Error(
        `Payment-sources entry ${paymentEntry.assetIdentifier} contains duplicate sourceIndex values`
      );
    }
  }

  for (const entry of snapshot.entries) {
    const sourceEntry = sourceEntryByAsset.get(entry.assetIdentifier);
    if (entry.metadataVersion >= 2) {
      if (entry.agentPricing != null) {
        throw new Error(
          `V2 snapshot entry ${entry.assetIdentifier} must not set top-level agentPricing`
        );
      }
      if (sourceEntry == null) {
        throw new Error(
          `V2 snapshot entry ${entry.assetIdentifier} requires source-owned pricing in the payment-sources file`
        );
      }
      continue;
    }

    if (entry.agentPricing == null) {
      throw new Error(
        `V1 snapshot entry ${entry.assetIdentifier} requires top-level agentPricing`
      );
    }
    if (sourceEntry != null) {
      throw new Error(
        `V1 snapshot entry ${entry.assetIdentifier} must not set supported payment sources`
      );
    }
  }

  for (const assetIdentifier of sourceEntryByAsset.keys()) {
    if (
      !snapshot.entries.some(
        (entry) => entry.assetIdentifier === assetIdentifier
      )
    ) {
      throw new Error(
        `Payment-sources entry ${assetIdentifier} has no matching registry entry`
      );
    }
  }
}
