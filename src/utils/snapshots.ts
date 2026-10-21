/**
 * Formatting helpers for the Vault Time Machine views.
 *
 * Kept out of `TimeMachineView.tsx` so the component file exports components only
 * (react-refresh/only-export-components), and so the tests can cover the
 * formatting rules without rendering.
 */

/** Unix seconds → `21 Oct 2026, 14:05`. `0` is reported honestly, not as 1970. */
export function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "unknown time";
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Byte count → `12 kB` / `3.4 MB`. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 kB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
