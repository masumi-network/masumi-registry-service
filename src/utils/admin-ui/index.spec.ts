import express from 'express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { serveAdminUi } from '@/utils/admin-ui';

jest.mock('@/utils/logger', () => ({ logger: { warn: jest.fn() } }));

const API_FALLTHROUGH = 'api-fallthrough';

async function startServer(distDir: string) {
  const app = express();
  serveAdminUi(app, distDir);
  app.use((_req, res) => {
    res.status(418).send(API_FALLTHROUGH);
  });
  const server = await new Promise<Server>((resolveServer) => {
    const listening = app.listen(0, () => resolveServer(listening));
  });
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function stopServer(server: Server) {
  return new Promise<void>((resolveStop) => server.close(() => resolveStop()));
}

describe('serveAdminUi', () => {
  let rootDir: string;
  let distDir: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    rootDir = mkdtempSync(join(tmpdir(), 'admin-ui-'));
    distDir = join(rootDir, 'dist');
    mkdirSync(join(distDir, '_next/static/chunks'), { recursive: true });
    writeFileSync(join(distDir, 'index.html'), 'index-page');
    writeFileSync(join(distDir, 'about.html'), 'about-page');
    writeFileSync(join(distDir, '404.html'), 'not-found-page');
    writeFileSync(join(distDir, '_next/static/chunks/app.js'), 'chunk');
    writeFileSync(join(rootDir, 'secret.html'), 'secret');
    ({ server, baseUrl } = await startServer(distDir));
  });

  afterAll(async () => {
    await stopServer(server);
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('serves the index page at the base path', async () => {
    const response = await fetch(`${baseUrl}/admin`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('index-page');
  });

  it('serves a pre-rendered page for a route without extension', async () => {
    const response = await fetch(`${baseUrl}/admin/about/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('about-page');
  });

  it('answers an unknown route with the 404 page', async () => {
    const response = await fetch(`${baseUrl}/admin/does-not-exist`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('not-found-page');
  });

  it('does not serve pages outside the dist directory', async () => {
    const response = await fetch(`${baseUrl}/admin/..%2fsecret`);
    expect(await response.text()).not.toBe('secret');
  });

  it('caches hashed assets as immutable', async () => {
    const response = await fetch(`${baseUrl}/admin/_next/static/chunks/app.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('lets the API answer a missing asset', async () => {
    const response = await fetch(`${baseUrl}/admin/missing.js`);
    expect(response.status).toBe(418);
    expect(await response.text()).toBe(API_FALLTHROUGH);
  });

  it('lets the API answer non-GET requests', async () => {
    const response = await fetch(`${baseUrl}/admin/about`, { method: 'POST' });
    expect(response.status).toBe(418);
  });

  it('lets the API answer when no build exists', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'admin-ui-empty-'));
    const empty = await startServer(emptyDir);
    try {
      const response = await fetch(`${empty.baseUrl}/admin/about`);
      expect(response.status).toBe(418);
      expect(await response.text()).toBe(API_FALLTHROUGH);
    } finally {
      await stopServer(empty.server);
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
