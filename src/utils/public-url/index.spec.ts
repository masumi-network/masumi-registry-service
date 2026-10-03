import { lookup } from 'node:dns/promises';
import {
  normalizePublicUrl,
  resolvePublicUrl,
  validatePublicUrl,
} from '@/utils/public-url';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

describe('public url helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (lookup as jest.Mock).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  it('returns the exact validated addresses without a second DNS lookup', async () => {
    const destination = await resolvePublicUrl('https://example.com/card');
    expect(destination.addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('returns public literal addresses without resolving DNS', async () => {
    expect(
      (await resolvePublicUrl('https://93.184.216.34/card')).addresses
    ).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('normalizes a valid public url and trims a trailing slash', () => {
    expect(normalizePublicUrl('https://example.com/base/')).toEqual(
      expect.objectContaining({
        hostname: 'example.com',
        normalizedUrl: 'https://example.com/base',
      })
    );
  });

  it('rejects query strings and fragments', () => {
    expect(() => normalizePublicUrl('https://example.com?foo=bar')).toThrow(
      'URL must not contain a query string'
    );
    expect(() => normalizePublicUrl('https://example.com#frag')).toThrow(
      'URL must not contain a fragment'
    );
  });

  it('rejects blocked literal ip ranges', async () => {
    await expect(validatePublicUrl('http://127.0.0.1')).rejects.toMatchObject({
      code: 'blocked_ip',
    });
    await expect(validatePublicUrl('http://10.20.30.40')).rejects.toMatchObject(
      {
        code: 'blocked_ip',
      }
    );
    await expect(validatePublicUrl('http://[::1]')).rejects.toMatchObject({
      code: 'blocked_ip',
    });
  });

  it('rejects blocked metadata and internal hostnames after dns resolution', async () => {
    (lookup as jest.Mock).mockResolvedValueOnce([
      { address: '169.254.169.254', family: 4 },
    ]);

    await expect(
      validatePublicUrl('http://metadata.example.com')
    ).rejects.toMatchObject({
      code: 'blocked_ip',
    });
  });

  it('rejects explicitly blocked metadata hostnames', async () => {
    await expect(
      validatePublicUrl('http://metadata.google.internal')
    ).rejects.toMatchObject({
      code: 'blocked_hostname',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('fails closed when a hostname cannot be resolved', async () => {
    (lookup as jest.Mock).mockRejectedValueOnce(new Error('dns failed'));

    await expect(validatePublicUrl('http://example.com')).rejects.toMatchObject(
      {
        code: 'unresolvable_hostname',
      }
    );
  });
});
