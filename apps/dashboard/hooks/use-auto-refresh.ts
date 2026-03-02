import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutoRefresh(callback: () => void, intervalMs: number) {
  const [enabled, setEnabled] = useState(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => callbackRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);

  const toggle = useCallback(() => setEnabled((prev) => !prev), []);

  return { enabled, toggle };
}
