import express, { type IRouter } from 'express';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, sep } from 'path';
import { logger } from '@/utils/logger/';

// Must match `basePath` in frontend/next.config.ts.
const ADMIN_BASE_PATH = '/admin';
const HAS_FILE_EXTENSION = /\.[a-zA-Z0-9]+$/;
// Next.js puts a content hash in every file name under _next/static.
const HASHED_ASSETS_MAX_AGE = '1y';
const HTML_EXTENSION = '.html';
const INDEX_ROUTE = 'index';
const NOT_FOUND_ROUTE = '404';

/**
 * Reads every exported page once, keyed by route (about.html -> "about").
 * Requests are then answered from memory, so no request-derived path ever
 * reaches the file system. A rebuilt export needs a server restart.
 */
function loadPages(distDir: string): Map<string, Buffer> {
  const pages = new Map<string, Buffer>();
  if (!existsSync(distDir)) {
    return pages;
  }
  const files = readdirSync(distDir, { recursive: true, encoding: 'utf8' });
  for (const file of files) {
    if (!file.endsWith(HTML_EXTENSION)) {
      continue;
    }
    const route = file.slice(0, -HTML_EXTENSION.length).split(sep).join('/');
    pages.set(route, readFileSync(join(distDir, file)));
  }
  return pages;
}

/**
 * Serves the admin UI's Next.js static export (frontend/dist) under /admin.
 * Anything it cannot answer falls through to the API routes.
 */
export function serveAdminUi(app: IRouter, distDir: string): void {
  if (!existsSync(join(distDir, 'index.html'))) {
    logger.warn(
      `Admin UI not found at ${distDir}; run "pnpm build" to serve it at ${ADMIN_BASE_PATH}`
    );
  }

  app.use(
    `${ADMIN_BASE_PATH}/_next/static`,
    express.static(join(distDir, '_next/static'), {
      immutable: true,
      maxAge: HASHED_ASSETS_MAX_AGE,
    })
  );
  app.use(ADMIN_BASE_PATH, express.static(distDir));

  const pages = loadPages(distDir);
  const notFoundPage = pages.get(NOT_FOUND_ROUTE);

  // Every admin route is its own pre-rendered page (about -> about.html), so a hard
  // reload of /admin/about must send that page rather than the API's JSON 404.
  app.use(ADMIN_BASE_PATH, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    // express.static already served real assets; a missing one is not a page.
    if (HAS_FILE_EXTENSION.test(req.path)) {
      return next();
    }

    const routeName = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
    const page = pages.get(routeName === '' ? INDEX_ROUTE : routeName);
    if (page) {
      return res.type('html').send(page);
    }
    // No build (or no 404 page): let the API answer.
    if (!notFoundPage) {
      return next();
    }
    res.status(404).type('html').send(notFoundPage);
  });
}
