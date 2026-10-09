// dotenv must not refill variables from the developer's local .env file.
jest.mock('dotenv', () => ({ config: jest.fn() }));

const NUMERIC_VARS = [
  'UPDATE_CARDANO_REGISTRY_INTERVAL',
  'UPDATE_HEALTH_CHECK_INTERVAL',
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
      expect(() => loadConfig({ [name]: '1e12' })).toThrow(
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

  it('requires a whole number of pool connections', () => {
    expect(() => loadConfig({ DB_CONNECTION_POOL_LIMIT: '2.5' })).toThrow(
      /DB_CONNECTION_POOL_LIMIT/
    );
  });
});
