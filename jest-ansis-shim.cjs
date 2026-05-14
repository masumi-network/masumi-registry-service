/* eslint-disable */
/* global module, __dirname */
/* CJS shim for ansis — used via moduleNameMapper so babel's interop can find
   named exports (hex, blue, etc.) when transforming express-zod-api's ESM dist.
   ansis@4 CJS build exposes all named exports as own properties. */
const path = require('path');
const ansis = require(
  path.resolve(__dirname, 'node_modules/.pnpm/ansis@4.3.0/node_modules/ansis/index.cjs')
);
module.exports = ansis;
module.exports.__esModule = true;
module.exports.default = ansis;
