import nock from 'nock';
import { resetCache, closeCache } from '../src/cache/index.js';
import { resetUsage } from '../src/lib/apiUsage.js';
import { resetCountryIndex } from '../src/services/countryService.js';

/**
 * Global test harness.
 *
 * Two decisions worth explaining:
 *
 * 1. **No `jest.mock`.** The suite intercepts at the HTTP layer with nock
 *    instead of stubbing modules. That means every test exercises the *real*
 *    axios client, retry policy, timeout handling, normalisers and cache — the
 *    code that actually ships — rather than a mock of it. It also sidesteps
 *    ESM's awkward module-mocking story entirely.
 *
 * 2. **Network access is blocked.** `disableNetConnect` guarantees a test can
 *    never silently reach a real third-party API. If a request is not mocked,
 *    the test fails loudly instead of passing slowly (or flaking when
 *    OpenStreetMap has a bad day). Localhost stays open because Supertest
 *    binds an ephemeral port.
 */

nock.disableNetConnect();
nock.enableNetConnect((host) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host));

beforeEach(async () => {
  // Caches and quota counters are process-global; a leaked entry from one test
  // would make the next one pass for the wrong reason.
  await resetCache();
  resetUsage();
  resetCountryIndex();
});

afterEach(() => {
  nock.cleanAll();
  nock.abortPendingRequests();
});

afterAll(async () => {
  await closeCache();
  nock.enableNetConnect();
  nock.restore();
});
