/* global module */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  verbose: true,
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^ansis$': '<rootDir>/jest-ansis-shim.cjs',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
    '^.+\\.js$': [
      'babel-jest',
      {
        presets: ['babel-preset-current-node-syntax'],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  // Transform express-zod-api (pure ESM). The lookahead (?!.*express-zod-api)
  // prevents matching when the path segment leads into express-zod-api (handles
  // both npm-flat and pnpm .pnpm/<name>@<ver>/node_modules/ layouts).
  transformIgnorePatterns: ['/node_modules/(?!.*express-zod-api)'],
  testEnvironment: 'node',
};
