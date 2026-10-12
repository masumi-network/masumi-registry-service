import express, { type IRouter } from 'express';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { logger } from '@/utils/logger/';

// Must match `basePath` in frontend/next.config.ts.
const ADMIN_BASE_PATH = '/admin';
const HAS_FILE_EXTENSION = /\.[a-zA-Z0-9]+$/;

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

  app.use(ADMIN_BASE_PATH, express.static(distDir));

  // Every admin route is its own pre-rendered page (about -> about.html), so a hard
  // reload of /admin/about must send that file rather than the API's JSON 404.
  app.use(ADMIN_BASE_PATH, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    // express.static already served real assets; a missing one is not a page.
    if (HAS_FILE_EXTENSION.test(req.path)) {
      return next();
    }

    const routeName = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
    const htmlFile = routeName === '' ? 'index.html' : `${routeName}.html`;
    const requestedPath = resolve(distDir, htmlFile);

    // Keep the resolved path inside dist (no "../" traversal).
    const relativeToBase = relative(distDir, requestedPath);
    const isOutsideBase =
      relativeToBase.startsWith('..') || isAbsolute(relativeToBase);
    const isMissing = isOutsideBase || !existsSync(requestedPath);
    const fileToSend = isMissing ? join(distDir, '404.html') : requestedPath;

    // Read before touching the response, so a fall-through leaves no status or
    // Content-Type behind for the API's own reply.
    let page: Buffer;
    try {
      page = readFileSync(fileToSend);
    } catch {
      // No build (or no 404 page): let the API answer.
      return next();
    }
    res
      .status(isMissing ? 404 : 200)
      .type('html')
      .send(page);
  });
}
