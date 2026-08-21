/**
 * Jest configuration for an ESM codebase.
 *
 * The suite runs with `NODE_OPTIONS=--experimental-vm-modules` (see the `test`
 * script) which is what lets Jest load real ES modules. Because of that we
 * avoid `jest.mock` entirely and intercept at the HTTP layer with nock instead —
 * which has the happy side effect of exercising the real axios client, retry and
 * timeout logic rather than a stub of it.
 */
export default {
  testEnvironment: 'node',
  // Source is already ESM and Node can run it directly: no Babel, no ts-jest.
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 20_000,
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/db.js',
    '!src/cache/redisStore.js',
  ],
  coverageReporters: ['text-summary', 'lcov'],
};
