import {
  buildSwaggerUiOptions,
  getCorsHeaders,
  parseCorsAllowedOrigins,
} from '@/utils/http-security';

describe('http security helpers', () => {
  it('parses a comma-separated cors allowlist into canonical origins', () => {
    expect(
      parseCorsAllowedOrigins('https://docs.example.com, http://localhost:3000')
    ).toEqual(['https://docs.example.com', 'http://localhost:3000']);
  });

  it('rejects invalid cors origins', () => {
    expect(() => parseCorsAllowedOrigins('ftp://example.com')).toThrow(
      'Invalid CORS_ALLOWED_ORIGINS ENV variable'
    );
  });

  it('does not emit a wildcard cors header when no origins are configured', () => {
    const headers = getCorsHeaders({
      allowedOrigins: [],
      request: {
        headers: {
          origin: 'https://docs.example.com',
        },
      },
    });

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('echoes an allowed origin and keeps same-origin docs compatible', () => {
    const headers = getCorsHeaders({
      allowedOrigins: ['https://docs.example.com'],
      request: {
        headers: {
          origin: 'https://docs.example.com',
        },
      },
    });

    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://docs.example.com'
    );
    expect(headers.Vary).toBe('Origin');
  });

  it('keeps swagger auth persistence enabled', () => {
    expect(buildSwaggerUiOptions('body { color: red; }')).toEqual(
      expect.objectContaining({
        customCss: 'body { color: red; }',
        swaggerOptions: expect.objectContaining({
          persistAuthorization: true,
          tryItOutEnabled: true,
        }),
      })
    );
  });
});
