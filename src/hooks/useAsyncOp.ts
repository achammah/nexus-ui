import * as React from "react";

/* Drive a long, off-machine async op to completion with a STALL guard — the pattern
   behind "the thing is generating; keep polling, tell me if it's taking too long".
   While `inFlight` is true, `pollFn` runs every `everyMs` (pull the result in / refetch);
   when `inFlight` flips false the op settled → `onSettle` fires once. `stalled` flips
   true after `stallAfterMs` with no settle (surface a "taking longer than usual" hint).
   `now` is injectable so the stall clock is deterministic in tests. */

/* pure core — the stall/elapsed decision, no React, no wall clock (testable) */
export function computeAsyncOp(startMs: number, nowMs: number, stallAfterMs: number): { stalled: boolean; elapsedMs: number } {
  const elapsedMs = Math.max(0, nowMs - startMs);
  return { stalled: elapsedMs > stallAfterMs, elapsedMs };
}

export function useAsyncOp(
  inFlight: boolean,
  {
    pollFn,
    everyMs = 4000,
    stallAfterMs = 180000,
    onSettle,
    now = () => Date.now(),
  }: { pollFn?: () => void | Promise<void>; everyMs?: number; stallAfterMs?: number; onSettle?: () => void; now?: () => number },
): { stalled: boolean; elapsedMs: number } {
  const [state, setState] = React.useState<{ stalled: boolean; elapsedMs: number }>({ stalled: false, elapsedMs: 0 });
  const startRef = React.useRef(0);
  const wasInFlight = React.useRef(false);
  const cbs = React.useRef({ pollFn, onSettle, now });
  cbs.current = { pollFn, onSettle, now };
  React.useEffect(() => {
    if (!inFlight) {
      if (wasInFlight.current) { wasInFlight.current = false; cbs.current.onSettle?.(); }
      setState({ stalled: false, elapsedMs: 0 });
      startRef.current = 0;
      return;
    }
    wasInFlight.current = true;
    if (!startRef.current) startRef.current = cbs.current.now();
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      setState(computeAsyncOp(startRef.current, cbs.current.now(), stallAfterMs));
      try { await cbs.current.pollFn?.(); } catch { /* transient — keep polling */ }
    };
    tick();
    const id = setInterval(tick, everyMs);
    return () => { alive = false; clearInterval(id); };
  }, [inFlight, everyMs, stallAfterMs]);
  return state;
}
