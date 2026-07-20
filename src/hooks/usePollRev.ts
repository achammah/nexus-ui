import * as React from "react";

/* Live-sync seam: poll a revision counter and fire onChange when it moved (ANOTHER
   writer bumped it). Transport-agnostic — pass a `fetchRev` that resolves the current
   revision number (e.g. `() => api.rev(key).then(r => r.rev)`); SSE can replace the
   interval later without touching consumers. Pauses while the tab is hidden. Pass
   `resetKey` (e.g. the object/record id) so switching subject re-baselines instead of
   firing a spurious change. */

export function usePollRev(
  fetchRev: () => Promise<number>,
  onChange: () => void,
  resetKey?: unknown,
  intervalMs = 4000,
) {
  const revRef = React.useRef<number | null>(null);
  const fetchRef = React.useRef(fetchRev);
  fetchRef.current = fetchRev;
  React.useEffect(() => {
    revRef.current = null;
    let stopped = false;
    const tick = async () => {
      if (stopped || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      try {
        const rev = await fetchRef.current();
        if (revRef.current !== null && rev !== revRef.current) onChange();
        revRef.current = rev;
      } catch {
        /* transient — next tick retries */
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [onChange, resetKey, intervalMs]);
}
