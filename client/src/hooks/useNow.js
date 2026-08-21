import { useEffect, useState } from 'react';

/**
 * A clock value that is stable within a render pass.
 *
 * Reading `Date.now()` directly in a component body makes render non-idempotent:
 * two renders with identical props produce different output, which React (and
 * the React Compiler) explicitly disallow. Holding "now" in state fixes that and
 * has a pleasant side effect — relative timestamps like "3 minutes ago" tick
 * forward on their own instead of going stale until the next unrelated render.
 *
 * @param {number} intervalMs how often to advance the clock; 0 disables ticking
 * @returns {number} epoch milliseconds
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!intervalMs) return undefined;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

export default useNow;
