import * as React from "react";

export type SaveState = "idle" | "saving" | "saved";

/* Debounced autosave — coalesce rapid edits into ONE persist call and expose a
   save-state ("idle" → "saving" → "saved") for a status affordance. The debounce is a
   pure core (createDebouncer) so it's testable without React; the hook binds it to
   component state. */

/* pure core: schedule a persist, coalescing calls within `delay`; drives onState */
export function createDebouncer<T>(
  persist: (payload: T) => void | Promise<void>,
  delay: number,
  onState?: (s: SaveState) => void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    trigger(payload: T) {
      onState?.("saving");
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try { await persist(payload); onState?.("saved"); } catch { onState?.("idle"); }
      }, delay);
    },
    cancel() { if (timer) { clearTimeout(timer); timer = null; } },
  };
}

export function useDebouncedSave<T>(persistFn: (payload: T) => void | Promise<void>, delay = 700): { saveState: SaveState; trigger: (payload: T) => void } {
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const persistRef = React.useRef(persistFn);
  persistRef.current = persistFn;
  const debRef = React.useRef<ReturnType<typeof createDebouncer<T>> | null>(null);
  if (!debRef.current) {
    debRef.current = createDebouncer<T>((p) => persistRef.current(p), delay, setSaveState);
  }
  React.useEffect(() => () => debRef.current?.cancel(), []);
  return { saveState, trigger: (payload: T) => debRef.current!.trigger(payload) };
}
