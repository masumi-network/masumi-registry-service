import type { Snapshot, SnapshotEntry } from './snapshot-types';
import { SNAPSHOT_VERSION } from './snapshot-types';

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

export function validateSnapshot(
  snapshot: unknown
): asserts snapshot is Snapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new SnapshotValidationError('Snapshot must be an object');
  }

  const s = snapshot as Record<string, unknown>;

  if (typeof s.version !== 'number') {
    throw new SnapshotValidationError('Snapshot version must be a number');
  }

  if (s.version !== SNAPSHOT_VERSION) {
    throw new SnapshotValidationError(
      `Unsupported snapshot version: ${s.version}. Expected: ${SNAPSHOT_VERSION}`
    );
  }

  // Check exportedAt
  if (typeof s.exportedAt !== 'string') {
    throw new SnapshotValidationError('exportedAt must be a string');
  }

  // Validate date format
  if (isNaN(Date.parse(s.exportedAt))) {
    throw new SnapshotValidationError(
      'exportedAt must be a valid ISO date string'
    );
  }

  // Check network (optional)
  if (
    s.network !== null &&
    s.network !== 'Preprod' &&
    s.network !== 'Mainnet'
  ) {
    throw new SnapshotValidationError(
      'network must be null, "Preprod", or "Mainnet"'
    );
  }

  // Check totalEntries
  if (typeof s.totalEntries !== 'number' || s.totalEntries < 0) {
    throw new SnapshotValidationError(
      'totalEntries must be a non-negative number'
    );
  }

  // Check entries array
  if (!Array.isArray(s.entries)) {
    throw new SnapshotValidationError('entries must be an array');
  }

  if (s.entries.length !== s.totalEntries) {
    throw new SnapshotValidationError(
      `entries array length (${s.entries.length}) does not match totalEntries (${s.totalEntries})`
    );
  }

  // Validate each entry
  s.entries.forEach((entry, index) => {
    try {
      validateSnapshotEntry(entry);
    } catch (error) {
      throw new SnapshotValidationError(
        `Invalid entry at index ${index}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

function validateSnapshotEntry(entry: unknown): asserts entry is SnapshotEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Entry must be an object');
  }

  const e = entry as Record<string, unknown>;

  const requiredStrings = ['name', 'apiBaseUrl', 'image', 'assetIdentifier'];
  for (const field of requiredStrings) {
    if (typeof e[field] !== 'string' || (e[field] as string).length === 0) {
      throw new Error(`${field} must be a non-empty string`);
    }
  }

  const optionalStrings = [
    'description',
    'authorName',
    'authorContactEmail',
    'authorContactOther',
    'authorOrganization',
    'privacyPolicy',
    'termsAndCondition',
    'otherLegal',
  ];
  for (const field of optionalStrings) {
    if (e[field] !== null && typeof e[field] !== 'string') {
      throw new Error(`${field} must be a string or null`);
    }
  }

  // Tags array
  if (!Array.isArray(e.tags)) {
    throw new Error('tags must be an array');
  }

  // Payment type
  if (e.paymentType !== 'Web3CardanoV1' && e.paymentType !== 'None') {
    throw new Error('paymentType must be "Web3CardanoV1" or "None"');
  }

  // Metadata version
  if (typeof e.metadataVersion !== 'number') {
    throw new Error('metadataVersion must be a number');
  }

  // Registry source
  if (!e.registrySource || typeof e.registrySource !== 'object') {
    throw new Error('registrySource must be an object');
  }

  const rs = e.registrySource as Record<string, unknown>;
  if (rs.type !== 'Web3CardanoV1') {
    throw new Error('registrySource.type must be "Web3CardanoV1"');
  }
  if (
    rs.network !== null &&
    rs.network !== 'Preprod' &&
    rs.network !== 'Mainnet'
  ) {
    throw new Error(
      'registrySource.network must be null, "Preprod", or "Mainnet"'
    );
  }
  if (typeof rs.policyId !== 'string' || rs.policyId.length === 0) {
    throw new Error('registrySource.policyId must be a non-empty string');
  }

  if (e.capability !== null) {
    if (typeof e.capability !== 'object') {
      throw new Error('capability must be an object or null');
    }
    const cap = e.capability as Record<string, unknown>;
    if (typeof cap.name !== 'string' || cap.name.length === 0) {
      throw new Error('capability.name must be a non-empty string');
    }
    if (typeof cap.version !== 'string' || cap.version.length === 0) {
      throw new Error('capability.version must be a non-empty string');
    }
  }

  // Pricing
  if (!e.pricing || typeof e.pricing !== 'object') {
    throw new Error('pricing must be an object');
  }

  const pricing = e.pricing as Record<string, unknown>;
  if (pricing.type !== 'Fixed' && pricing.type !== 'Free') {
    throw new Error('pricing.type must be "Fixed" or "Free"');
  }

  if (!Array.isArray(pricing.amounts)) {
    throw new Error('pricing.amounts must be an array');
  }

  // Validate amounts if Fixed pricing
  if (pricing.type === 'Fixed' && pricing.amounts.length > 0) {
    pricing.amounts.forEach((amount, idx) => {
      if (!amount || typeof amount !== 'object') {
        throw new Error(`pricing.amounts[${idx}] must be an object`);
      }
      const amt = amount as Record<string, unknown>;
      if (typeof amt.amount !== 'string') {
        throw new Error(`pricing.amounts[${idx}].amount must be a string`);
      }
      if (typeof amt.unit !== 'string' || amt.unit.length === 0) {
        throw new Error(
          `pricing.amounts[${idx}].unit must be a non-empty string`
        );
      }
    });
  }

  // Agent output samples
  if (!Array.isArray(e.agentOutputs)) {
    throw new Error('agentOutputs must be an array');
  }

  e.agentOutputs.forEach((output, idx) => {
    if (!output || typeof output !== 'object') {
      throw new Error(`agentOutputs[${idx}] must be an object`);
    }
    const out = output as Record<string, unknown>;
    if (typeof out.name !== 'string' || out.name.length === 0) {
      throw new Error(`agentOutputs[${idx}].name must be a non-empty string`);
    }
    if (typeof out.mimeType !== 'string' || out.mimeType.length === 0) {
      throw new Error(
        `agentOutputs[${idx}].mimeType must be a non-empty string`
      );
    }
    if (typeof out.url !== 'string' || out.url.length === 0) {
      throw new Error(`agentOutputs[${idx}].url must be a non-empty string`);
    }
  });
}
