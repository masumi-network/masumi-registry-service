// dotenv must not refill variables from the developer's local .env file.
jest.mock('dotenv', () => ({ config: jest.fn() }));

const NUMERIC_VARS = [
  'UPDATE_CARDANO_REGISTRY_INTERVAL',
  'UPDATE_HEALTH_CHECK_INTERVAL',
  'UPDATE_PURCHASE_INDEX_INTERVAL',
  'UPDATE_X402_PROBE_INTERVAL',
  'DB_CONNECTION_TIMEOUT',
  'DB_CONNECTION_POOL_LIMIT',
  'DB_STAEMENT_TIMEOUT',
  'DB_POOL_TIMEOUT',
] as const;

const originalEnv = process.env;

function loadConfig(env: Record<string, string>) {
  process.env = { DATABASE_URL: 'postgresql://test', ...env };
  let config: typeof import('./index').CONFIG | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require('./index').CONFIG;
  });
  return config!;
}

afterEach(() => {
  process.env = originalEnv;
});

describe('numeric configuration', () => {
  it('uses the documented defaults when the variables are unset', () => {
    expect(loadConfig({})).toMatchObject({
      UPDATE_CARDANO_REGISTRY_INTERVAL: 50,
      UPDATE_HEALTH_CHECK_INTERVAL: 100,
      UPDATE_PURCHASE_INDEX_INTERVAL: 300,
      UPDATE_X402_PROBE_INTERVAL: 3600,
      RANKING_WEIGHTS: { distinctBuyers: 0.6, uptime: 0.3, lineageAge: 0.1 },
      DB_CONNECTION_TIMEOUT: 20,
      DB_CONNECTION_POOL_LIMIT: 5,
      DB_STAEMENT_TIMEOUT: 25000,
      DB_POOL_TIMEOUT: 25,
    });
  });

  it('accepts valid values', () => {
    expect(
      loadConfig({
        UPDATE_CARDANO_REGISTRY_INTERVAL: '120',
        UPDATE_HEALTH_CHECK_INTERVAL: ' 300 ',
        DB_CONNECTION_POOL_LIMIT: '10',
      })
    ).toMatchObject({
      UPDATE_CARDANO_REGISTRY_INTERVAL: 120,
      UPDATE_HEALTH_CHECK_INTERVAL: 300,
      DB_CONNECTION_POOL_LIMIT: 10,
    });
  });

  describe.each(NUMERIC_VARS)('%s', (name) => {
    it.each([
      ['garbage', 'garbage'],
      ['NaN', 'NaN'],
      ['Infinity', 'Infinity'],
      ['-Infinity', '-Infinity'],
      ['an empty string', ''],
      ['whitespace', '   '],
      ['a negative number', '-1'],
      ['zero', '0'],
      // 20000 is in range for every variable, so only the notation fails.
      ['hex notation', '0x4e20'],
      ['exponent notation', '2e4'],
      ['a leading plus sign', '+20000'],
    ])('rejects %s and names the variable', (_label, value) => {
      expect(() => loadConfig({ [name]: value })).toThrow(
        new RegExp(`^Invalid ${name} ENV variable`)
      );
    });
  });

  // The pool limit is not a timer, so it has no timer cap.
  it.each(NUMERIC_VARS.filter((name) => name !== 'DB_CONNECTION_POOL_LIMIT'))(
    'rejects a %s that would overflow a Node timer',
    (name) => {
      expect(() => loadConfig({ [name]: '99999999999' })).toThrow(
        new RegExp(`^Invalid ${name} ENV variable`)
      );
    }
  );

  it('keeps the existing minimums', () => {
    expect(() =>
      loadConfig({ UPDATE_CARDANO_REGISTRY_INTERVAL: '19' })
    ).toThrow(/UPDATE_CARDANO_REGISTRY_INTERVAL/);
    expect(() => loadConfig({ DB_STAEMENT_TIMEOUT: '9999' })).toThrow(
      /DB_STAEMENT_TIMEOUT/
    );
  });

  it('bounds the health-check interval like the registry sync interval', () => {
    expect(() => loadConfig({ UPDATE_HEALTH_CHECK_INTERVAL: '19' })).toThrow(
      /UPDATE_HEALTH_CHECK_INTERVAL/
    );
    expect(loadConfig({ UPDATE_HEALTH_CHECK_INTERVAL: '20' })).toMatchObject({
      UPDATE_HEALTH_CHECK_INTERVAL: 20,
    });
  });

  it('keeps the x402 probe interval at least five minutes', () => {
    expect(() => loadConfig({ UPDATE_X402_PROBE_INTERVAL: '299' })).toThrow(
      /UPDATE_X402_PROBE_INTERVAL/
    );
    expect(loadConfig({ UPDATE_X402_PROBE_INTERVAL: '300' })).toMatchObject({
      UPDATE_X402_PROBE_INTERVAL: 300,
    });
  });

  describe('X402_DISCOVERY_FACILITATOR_URL', () => {
    it('defaults to the Coinbase CDP facilitator', () => {
      expect(loadConfig({})).toMatchObject({
        X402_DISCOVERY_FACILITATOR_URL:
          'https://api.cdp.coinbase.com/platform/v2/x402',
      });
    });

    it('accepts an https url and drops a trailing slash', () => {
      expect(
        loadConfig({
          X402_DISCOVERY_FACILITATOR_URL: 'https://facilitator.example/x402/',
        })
      ).toMatchObject({
        X402_DISCOVERY_FACILITATOR_URL: 'https://facilitator.example/x402',
      });
    });

    it.each([
      ['http', 'http://facilitator.example'],
      ['garbage', 'not a url'],
      ['userinfo', 'https://user:pw@facilitator.example'],
      ['a query string', 'https://facilitator.example/x?a=1'],
      ['a custom port', 'https://facilitator.example:8443'],
      ['an empty query', 'https://facilitator.example/x?'],
      ['an empty fragment', 'https://facilitator.example/x#'],
      ['a backslash', 'https://facilitator.example\\@evil.example'],
    ])('rejects %s and names the variable', (_label, value) => {
      expect(() =>
        loadConfig({ X402_DISCOVERY_FACILITATOR_URL: value })
      ).toThrow(/^Invalid X402_DISCOVERY_FACILITATOR_URL ENV variable/);
    });
  });

  it('requires a whole number of pool connections', () => {
    expect(() => loadConfig({ DB_CONNECTION_POOL_LIMIT: '2.5' })).toThrow(
      /DB_CONNECTION_POOL_LIMIT/
    );
  });

  it('rejects a malformed ranking weight and an all-zero weight set', () => {
    expect(() => loadConfig({ RANKING_WEIGHT_UPTIME: '-1' })).toThrow(
      /^Invalid RANKING_WEIGHT_UPTIME ENV variable/
    );
    expect(() =>
      loadConfig({
        RANKING_WEIGHT_DISTINCT_BUYERS: '0',
        RANKING_WEIGHT_UPTIME: '0',
        RANKING_WEIGHT_LINEAGE_AGE: '0',
      })
    ).toThrow(/RANKING_WEIGHT_\*/);
  });
});
