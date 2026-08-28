import { useCallback, useRef, useState } from "react";

/* eslint-disable react-refresh/only-export-components -- hook + component pair is the intended shape here */

/**
 * Shared toast state for in-app feedback (Ledger-calm pattern).
 *
 * Replaces native `alert()` everywhere: messages appear as a quiet, fixed
 * toast in the bottom-right corner — grey text, no error colours, dismissible
 * with ✕ and auto-clearing after 8 seconds. Presence, not pressure.
 *
 * Usage:
 *   const { toast, showToast } = useToast();
 *   showToast("Map saved.");
 *   ...
 *   {toast && <Toast message={toast} onDismiss={() => showToast(null)} />}
 *
 * The render side uses the exact visual pattern FolderCanvas already shipped
 * in Increment C (surface bg, 1px border, 8s auto-clear, ✕ button).
 */

export const TOAST_DURATION_MS = 8000;

export interface UseToastReturn {
  /** Current toast message, or null when no toast is showing. */
  toast: string | null;
  /** Show a toast; pass null to dismiss immediately. */
  showToast: (message: string | null) => void;
  /** Dismiss the current toast. */
  dismissToast: () => void;
}

export function useToast(): UseToastReturn {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const showToast = useCallback((message: string | null) => {
    clearTimer();
    if (message === null) {
      setToast(null);
      return;
    }
    setToast(message);
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  const dismissToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, []);

  return { toast, showToast, dismissToast };
}

export interface ToastProps {
  message: string;
  onDismiss: () => void;
}

/**
 * The toast element itself. Render at the top level of a view:
 *   {toast && <Toast message={toast} onDismiss={dismissToast} />}
 *
 * Styling deliberately matches FolderCanvas's existing toast: calm surface
 * colour, no red, bottom-right, fixed position.
 */
export const Toast: React.FC<ToastProps> = ({ message, onDismiss }) => {
  return (
    <div
      role="status"
      data-od-id="toast"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 1000,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 0,
        padding: "12px 16px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        maxWidth: "360px",
        color: "var(--fg)",
        fontSize: "13px",
        lineHeight: "1.4",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          fontSize: "14px",
          lineHeight: 1,
          padding: "2px",
        }}
      >
        ✕
      </button>
    </div>
  );
};