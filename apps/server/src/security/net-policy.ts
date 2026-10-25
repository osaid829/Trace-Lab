import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class PolicyError extends Error {
  constructor(public readonly code: 'INVALID_URL' | 'UNSUPPORTED_PROTOCOL' | 'TARGET_BLOCKED' | 'DNS_RESOLUTION_FAILED', message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

export type ResolvedTarget = {
  url: URL;
  addresses: Array<{ address: string; family: 4 | 6 }>;
};

export type Lookup = (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const CLOUD_METADATA = new Set(['169.254.169.254', '100.100.100.200', 'fd00:ec2::254']);

function normalizeIp(address: string): string {
  try {
    return ipaddr.process(address).toString().toLowerCase();
  } catch {
    return address.toLowerCase();
  }
}

export function classifyAddress(address: string): string {
  const normalized = normalizeIp(address);
  if (CLOUD_METADATA.has(normalized)) return 'metadata';
  try {
    return ipaddr.parse(normalized).range();
  } catch {
    return 'invalid';
  }
}

function isBlockedRange(address: string, allowPrivateTargets: boolean): boolean {
  const normalized = normalizeIp(address);
  if (CLOUD_METADATA.has(normalized)) return true;
  const range = classifyAddress(address);
  if (['invalid', 'multicast', 'unspecified', 'reserved', 'broadcast', 'linkLocal'].includes(range)) return true;
  if (!allowPrivateTargets && ['private', 'loopback'].includes(range)) return true;
  return false;
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> {
  try {
    return (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => ({
      address: entry.address,
      family: entry.family === 6 ? 6 : 4
    }));
  } catch {
    throw new PolicyError('DNS_RESOLUTION_FAILED', 'The target hostname could not be resolved.');
  }
}

export async function validateTarget(rawUrl: string, allowPrivateTargets: boolean, lookup: Lookup = defaultLookup): Promise<ResolvedTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PolicyError('INVALID_URL', 'Enter a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new PolicyError('UNSUPPORTED_PROTOCOL', 'Only HTTP and HTTPS URLs are supported.');
  if (!url.hostname || url.username || url.password) throw new PolicyError('INVALID_URL', 'URLs cannot contain credentials and must include a hostname.');

  let addresses: Array<{ address: string; family: 4 | 6 }>;
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname;
  if (ipaddr.isValid(hostname)) {
    try {
      const parsed = ipaddr.parse(hostname);
      addresses = [{ address: parsed.toString(), family: parsed.kind() === 'ipv6' ? 6 : 4 }];
    } catch {
      throw new PolicyError('INVALID_URL', 'The target hostname is not a valid IP address.');
    }
  } else {
    addresses = await lookup(hostname);
    if (addresses.length === 0) throw new PolicyError('DNS_RESOLUTION_FAILED', 'The target hostname did not resolve to an address.');
  }
  if (addresses.some((entry) => isBlockedRange(entry.address, allowPrivateTargets))) {
    throw new PolicyError('TARGET_BLOCKED', allowPrivateTargets
      ? 'The target is blocked because it is a metadata, link-local, multicast, or otherwise unsafe address.'
      : 'The target is blocked by default. Enable local/private target access in the server configuration for development-only API testing.');
  }
  return { url, addresses };
}

export function createPinnedLookup(target: ResolvedTarget): (hostname: string, options: { all?: boolean }, callback: (error: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>) => void) => void {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, target.addresses);
      return;
    }
    const first = target.addresses[0];
    if (!first) {
      callback(Object.assign(new Error('No validated address'), { code: 'ENOTFOUND' }), '');
      return;
    }
    callback(null, first.address);
  };
}

export function isSameOrigin(left: URL, right: URL): boolean {
  return left.origin === right.origin;
}
