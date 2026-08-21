import { useToast } from '../../context/ToastContext.jsx';
import { CheckIcon, InfoIcon, WarningIcon, XIcon } from './Icons.jsx';

const STYLES = {
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  error:
    'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  info: 'border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
};

const ICONS = {
  success: CheckIcon,
  error: WarningIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

/**
 * Toast viewport.
 *
 * `aria-live="polite"` on the container means announcements are queued rather
 * than interrupting, and `role="status"` on each toast makes the text available
 * to assistive technology without stealing focus.
 */
export default function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] ?? InfoIcon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${STYLES[toast.type] ?? STYLES.info}`}
          >
            <Icon className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{toast.message}</p>
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action.onClick();
                    dismiss(toast.id);
                  }}
                  className="mt-1 text-sm font-semibold underline underline-offset-2"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
