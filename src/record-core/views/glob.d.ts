/* Vite's import.meta.glob (build-time file discovery), minimally typed so the
   view registry compiles without pulling vite/client into consumers (whose own
   ambient declarations, e.g. `*?raw`, it would collide with). Vite provides the
   implementation; tsc only needs the shape. */
interface ImportMeta {
  glob<T = unknown>(pattern: string, options?: { eager?: boolean; import?: string }): Record<string, T>;
}
