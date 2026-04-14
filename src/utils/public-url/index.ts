import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type PublicUrlValidationErrorCode =
  | 'blank'
  | 'invalid_url'
  | 'invalid_protocol'
  | 'query_not_allowed'
  | 'fragment_not_allowed'
  | 'blocked_hostname'
  | 'blocked_ip'
  | 'unresolvable_hostname';

export class PublicUrlValidationError extends Error {
  constructor(
    public readonly code: PublicUrlValidationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PublicUrlValidationError';
  }
}

type NormalizePublicUrlOptions = {
  allowQuery?: boolean;
  allowHash?: boolean;
  trimTrailingSlash?: boolean;
};

export type NormalizedPublicUrl = {
  hostname: string;
  normalizedUrl: string;
  url: URL;
};

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

const IPV4_RANGES = [
  ipv4Cidr('0.0.0.0', 8),
  ipv4Cidr('10.0.0.0', 8),
  ipv4Cidr('100.64.0.0', 10),
  ipv4Cidr('127.0.0.0', 8),
  ipv4Cidr('169.254.0.0', 16),
  ipv4Cidr('172.16.0.0', 12),
  ipv4Cidr('192.0.0.0', 24),
  ipv4Cidr('192.0.2.0', 24),
  ipv4Cidr('192.88.99.0', 24),
  ipv4Cidr('192.168.0.0', 16),
  ipv4Cidr('198.18.0.0', 15),
  ipv4Cidr('198.51.100.0', 24),
  ipv4Cidr('203.0.113.0', 24),
  ipv4Cidr('224.0.0.0', 4),
  ipv4Cidr('240.0.0.0', 4),
];

const IPV6_RANGES = [
  ipv6Cidr('::', 128),
  ipv6Cidr('::1', 128),
  ipv6Cidr('::ffff:0:0', 96),
  ipv6Cidr('100::', 64),
  ipv6Cidr('2001:2::', 48),
  ipv6Cidr('2001:db8::', 32),
  ipv6Cidr('fc00::', 7),
  ipv6Cidr('fe80::', 10),
  ipv6Cidr('ff00::', 8),
];

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function parseIpv4ToInt(address: string): number {
  return address.split('.').reduce((result, part) => {
    return ((result << 8) | Number(part)) >>> 0;
  }, 0);
}

function ipv4Cidr(baseAddress: string, prefixLength: number): [number, number] {
  const baseValue = parseIpv4ToInt(baseAddress);
  const hostBits = 32 - prefixLength;
  const mask = prefixLength === 0 ? 0 : ((0xffffffff << hostBits) >>> 0) >>> 0;
  const start = (baseValue & mask) >>> 0;
  const end = (start + (2 ** hostBits - 1)) >>> 0;
  return [start, end];
}

function expandIpv6Address(address: string): string[] {
  const normalizedAddress = address.toLowerCase().split('%')[0];
  let workingAddress = normalizedAddress;

  if (workingAddress.includes('.')) {
    const lastColonIndex = workingAddress.lastIndexOf(':');
    const ipv4Part = workingAddress.slice(lastColonIndex + 1);
    const ipv4Value = parseIpv4ToInt(ipv4Part);
    const highGroup = ((ipv4Value >>> 16) & 0xffff).toString(16);
    const lowGroup = (ipv4Value & 0xffff).toString(16);
    workingAddress = `${workingAddress.slice(0, lastColonIndex)}:${highGroup}:${lowGroup}`;
  }

  if (!workingAddress.includes('::')) {
    return workingAddress.split(':');
  }

  const [leftPart, rightPart] = workingAddress.split('::');
  const leftGroups = leftPart ? leftPart.split(':') : [];
  const rightGroups = rightPart ? rightPart.split(':') : [];
  const missingGroups = 8 - leftGroups.length - rightGroups.length;

  return [
    ...leftGroups,
    ...Array.from({ length: missingGroups }, () => '0'),
    ...rightGroups,
  ];
}

function parseIpv6ToBigInt(address: string): bigint {
  return expandIpv6Address(address).reduce((result, group) => {
    return (result << 16n) + BigInt(parseInt(group || '0', 16));
  }, 0n);
}

function ipv6Cidr(baseAddress: string, prefixLength: number): [bigint, bigint] {
  const baseValue = parseIpv6ToBigInt(baseAddress);
  const hostBits = BigInt(128 - prefixLength);
  const allBits = (1n << 128n) - 1n;
  const hostMask = hostBits === 0n ? 0n : (1n << hostBits) - 1n;
  const networkMask = allBits ^ hostMask;
  const start = baseValue & networkMask;
  const end = start | hostMask;
  return [start, end];
}

export function isBlockedIpAddress(address: string): boolean {
  const normalizedAddress = address.split('%')[0];
  const addressFamily = isIP(normalizedAddress);

  if (addressFamily === 4) {
    const ipv4Value = parseIpv4ToInt(normalizedAddress);
    return IPV4_RANGES.some(
      ([rangeStart, rangeEnd]) =>
        ipv4Value >= rangeStart && ipv4Value <= rangeEnd
    );
  }

  if (addressFamily === 6) {
    const ipv6Value = parseIpv6ToBigInt(normalizedAddress);
    return IPV6_RANGES.some(
      ([rangeStart, rangeEnd]) =>
        ipv6Value >= rangeStart && ipv6Value <= rangeEnd
    );
  }

  return false;
}

export function normalizePublicUrl(
  value: string,
  options: NormalizePublicUrlOptions = {}
): NormalizedPublicUrl {
  const {
    allowHash = false,
    allowQuery = false,
    trimTrailingSlash = true,
  } = options;
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new PublicUrlValidationError('blank', 'URL must not be blank');
  }

  let url: URL;
  try {
    url = new URL(trimmedValue);
  } catch {
    throw new PublicUrlValidationError(
      'invalid_url',
      'URL must be a valid absolute URL'
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicUrlValidationError(
      'invalid_protocol',
      'URL must use http or https'
    );
  }

  if (!allowQuery && url.search) {
    throw new PublicUrlValidationError(
      'query_not_allowed',
      'URL must not contain a query string'
    );
  }

  if (!allowHash && url.hash) {
    throw new PublicUrlValidationError(
      'fragment_not_allowed',
      'URL must not contain a fragment'
    );
  }

  const hostname = normalizeHostname(url.hostname);
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new PublicUrlValidationError(
      'blocked_hostname',
      'URL hostname is not allowed'
    );
  }

  if (isBlockedIpAddress(hostname)) {
    throw new PublicUrlValidationError(
      'blocked_ip',
      'URL host resolves to a non-public IP range'
    );
  }

  let normalizedUrl = url.toString();
  if (trimTrailingSlash && normalizedUrl.endsWith('/')) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  return {
    hostname,
    normalizedUrl,
    url,
  };
}

export async function validatePublicUrl(
  value: string,
  options: NormalizePublicUrlOptions = {}
): Promise<NormalizedPublicUrl> {
  const normalized = normalizePublicUrl(value, options);

  if (isIP(normalized.hostname)) {
    return normalized;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = (await lookup(normalized.hostname, {
      all: true,
      verbatim: true,
    })) as { address: string; family: number }[];
  } catch {
    throw new PublicUrlValidationError(
      'unresolvable_hostname',
      'URL hostname could not be resolved'
    );
  }

  if (addresses.length === 0) {
    throw new PublicUrlValidationError(
      'unresolvable_hostname',
      'URL hostname could not be resolved'
    );
  }

  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new PublicUrlValidationError(
        'blocked_ip',
        'URL hostname resolves to a non-public IP range'
      );
    }
  }

  return normalized;
}
