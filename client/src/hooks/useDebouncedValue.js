import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value.
 *
 * Used by the destination search box: geocoding is cached server-side, but there
 * is no reason to spend a round trip on every keystroke.
 *
 * @template T
 * @param {T} value
 * @param {number} delay milliseconds
 * @returns {T}
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
