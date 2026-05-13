/* global module */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  verbose: true,
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  testEnvironment: 'node',
};
