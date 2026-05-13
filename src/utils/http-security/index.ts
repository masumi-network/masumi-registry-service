import { NextFunction, Request, Response } from 'express';

type Headers = Record<string, string>;

export const DEFAULT_SECURITY_HEADERS: Headers = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
};

export const DEFAULT_CORS_HEADERS: Headers = {
  'Access-Control-Allow-Headers': 'Content-Type, token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range, X-Total-Count',
  'Access-Control-Max-Age': '5000',
};

export function parseCorsAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const parsedOrigin = new URL(origin);
      if (
        parsedOrigin.protocol !== 'http:' &&
        parsedOrigin.protocol !== 'https:'
      ) {
        throw new Error('Invalid CORS_ALLOWED_ORIGINS ENV variable');
      }

      return parsedOrigin.origin;
    });
}

export function getCorsHeaders(params: {
  allowedOrigins: string[];
  request: Pick<Request, 'headers'>;
}): Headers {
  const originHeader = params.request.headers.origin;
  const requestOrigin = Array.isArray(originHeader)
    ? originHeader[0]
    : originHeader;
  const headers: Headers = { ...DEFAULT_CORS_HEADERS };

  if (requestOrigin && params.allowedOrigins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
    headers.Vary = 'Origin';
  }

  return headers;
}

export function applySecurityHeaders(app: {
  disable?: (setting: string) => unknown;
  use: (
    handler: (request: Request, response: Response, next: NextFunction) => void
  ) => unknown;
}) {
  app.disable?.('x-powered-by');
  app.use((_request: Request, response: Response, next: NextFunction) => {
    for (const [header, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
      response.setHeader(header, value);
    }

    next();
  });
}

export function buildSwaggerUiOptions(customCss: string) {
  return {
    explorer: false,
    customSiteTitle: 'Registry Service API Documentation',
    customfavIcon: '/assets/swagger_favicon.svg',
    customCss,
    swaggerOptions: {
      persistAuthorization: true,
      tryItOutEnabled: true,
    },
  };
}
