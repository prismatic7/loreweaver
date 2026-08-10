import { useEffect, useRef, useCallback } from "react";

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled]):not([aria-hidden="true"])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(", ");

export interface UseFocusTrapOptions {
  /** Whether the focus trap is active. */
  active: boolean;
  /** Ref to the container that should trap focus. */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Optional ref to the element that triggered the modal. Focus is returned
   * to this element when the trap is deactivated.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Element to receive initial focus. Defaults to the first focusable child. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * A minimal, dependency-free focus trap for modal dialogs.
 *
 * - Keeps Tab / Shift+Tab cycling within the container while active.
 * - Moves focus to the first focusable element (or initialFocusRef) on activation.
 * - Returns focus to the trigger element on deactivation.
 */
export function useFocusTrap(options: UseFocusTrapOptions): void {
  const { active, containerRef, triggerRef, initialFocusRef } = options;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusable = useCallback((): HTMLElement[] => {
    const container = containerRef.current;
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
      (el) => el.tabIndex >= 0 && el.offsetParent !== null
    );
  }, [containerRef]);

  useEffect(() => {
    if (!active) return;

    // Remember the currently focused element so we can restore it later.
    const trigger = triggerRef?.current;
    previousFocusRef.current = trigger ?? (document.activeElement as HTMLElement | null);

    const container = containerRef.current;
    if (!container) return;

    const applyInitialFocus = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const focusable = getFocusable();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        container.focus();
      }
    };

    // Delay slightly to account for React render/layout.
    const timeoutId = setTimeout(applyInitialFocus, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !containerRef.current) return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey) {
        if (activeEl === first || !containerRef.current.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !containerRef.current.contains(activeEl)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, containerRef, triggerRef, initialFocusRef, getFocusable]);

  useEffect(() => {
    if (!active) {
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === "function") {
        // Defer so React can finish unmounting the modal first.
        setTimeout(() => previous.focus(), 0);
      }
      previousFocusRef.current = null;
    }
  }, [active]);
}
