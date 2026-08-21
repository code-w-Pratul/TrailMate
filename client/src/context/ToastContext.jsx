import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Minimal toast system for action feedback ("Trip saved", "Link copied").
 *
 * Deliberately not a dependency: four kinds, auto-dismiss, and an aria-live
 * region so screen readers hear the same confirmation sighted users see.
 */

const ToastContext = createContext(null);
let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, { type = 'info', duration = 4000, action } = {}) => {
      const id = ++nextId;
      setToasts((current) => [...current.slice(-3), { id, message, type, action }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toasts,
      dismiss,
      push,
      success: (message, options) => push(message, { ...options, type: 'success' }),
      error: (message, options) => push(message, { ...options, type: 'error', duration: 6000 }),
      warning: (message, options) => push(message, { ...options, type: 'warning', duration: 5000 }),
      info: (message, options) => push(message, { ...options, type: 'info' }),
    }),
    [toasts, dismiss, push]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

export default ToastContext;
