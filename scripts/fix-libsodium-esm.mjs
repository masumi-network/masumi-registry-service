/**
 * Workaround for broken ESM imports in libsodium-wrappers-sumo.
 *
 * The package's ESM entry (libsodium-wrappers.mjs) does:
 *   import e from "./libsodium-sumo.mjs"
 *
 * This relative import expects the file from the separate `libsodium-sumo`
 * package to be in the same directory. We copy the file to the expected
 * location after install.
 */
import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

try {
  // Resolve the main entry to find the package directory
  // (package.json subpath is blocked by exports, so resolve the main entry)
  const wrappersMain = require.resolve('libsodium-wrappers-sumo');
  const sumoMain = require.resolve('libsodium-sumo');

  // Walk up from the resolved entry to the package root (find node_modules/<pkg>)
  function pkgDir(resolvedPath, pkgName) {
    const marker = `/node_modules/${pkgName}/`;
    const idx = resolvedPath.lastIndexOf(marker);
    if (idx === -1) return null;
    return resolvedPath.slice(0, idx + marker.length);
  }

  const wrappersDir = pkgDir(wrappersMain, 'libsodium-wrappers-sumo');
  const sumoDir = pkgDir(sumoMain, 'libsodium-sumo');

  if (!wrappersDir || !sumoDir) process.exit(0);

  const target = resolve(wrappersDir, 'dist/modules-sumo-esm/libsodium-sumo.mjs');
  const source = resolve(sumoDir, 'dist/modules-sumo-esm/libsodium-sumo.mjs');

  if (existsSync(source) && !existsSync(target)) {
    copyFileSync(source, target);
    console.log(
      'fix-libsodium-esm: copied libsodium-sumo.mjs into libsodium-wrappers-sumo'
    );
  }
} catch {
  // libsodium packages not installed — nothing to fix
}
