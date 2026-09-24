import fs from 'fs';
import path from 'path';

type OpenApiDocument = {
  paths: Record<string, Record<string, { security?: unknown[] }>>;
};

// The generator loads the config module, which requires a database URL.
process.env.DATABASE_URL ??= 'postgresql://mock:mock@localhost:5432/mock';

// Pulled in by the route modules; pure ESM, which Jest does not transform.
jest.mock('@paralleldrive/cuid2', () => ({ createId: () => 'cuid' }));

function generate(): OpenApiDocument {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateOpenAPI } = require('./index');
  // Same serialization as cli.ts, which writes the checked-in document.
  return JSON.parse(
    JSON.stringify(generateOpenAPI(), (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

describe('generateOpenAPI', () => {
  const document = generate();

  it('matches the checked-in openapi-docs.json (run pnpm swagger-json)', () => {
    const checkedIn = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'openapi-docs.json'), 'utf-8')
    );
    expect(document).toEqual(checkedIn);
  });

  it('registers every endpoint group', () => {
    const operations = Object.entries(document.paths).flatMap(
      ([route, methods]) =>
        Object.keys(methods).map((method) => `${method} ${route}`)
    );

    expect(operations).toHaveLength(20);
    expect(operations).toEqual(
      expect.arrayContaining([
        'get /health/',
        'post /registry-entry/',
        'post /registry-diff/',
        'get /capability/',
        'post /inbox-agent-registration-diff/',
        'delete /registry-source/',
        'get /api-key-status/',
        'delete /api-key/',
      ])
    );
  });

  it('requires the API key on every endpoint except health', () => {
    for (const [route, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const security = route === '/health/' ? undefined : [{ 'API-Key': [] }];
        expect({ [`${method} ${route}`]: operation.security }).toEqual({
          [`${method} ${route}`]: security,
        });
      }
    }
  });
});
