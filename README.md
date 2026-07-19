# nexus-ui

The org component library for ANY product: **vendored shadcn/ui** (real registry source, `new-york-v4`, MIT — the full useful set: 47 items incl. form+zod, chart, sidebar, sheet/drawer, calendar, command…) bridged to the Nexus token canvas, plus the **record-core** (data table · kanban · record page) for record-system app classes (CRM/ATS/ticketing…).

**Navigate:** `AGENTS.md` (agent entry: invariants + tasks) · `docs/INDEX.md` (generated catalog: every component, kind, import, WHEN to use) · `docs/catalog.json` (machine-readable twin) · `docs/record-core.md` (the config-driven record system).

- **shadcn is the base, vendored verbatim:** `npm run vendor:shadcn` pulls component SOURCE from the registry into `src/components/ui/` (add names to the script's list for the long tail); local opinions live in `src/primitives/` wrappers, never in vendored files; upstream tracked via the fork `github.com/achammah/ui`.
- **Distribution = SOURCE** (the shadcn model): consumers vendor `src/` (the starter ships a synced copy under `src/ui/`) and own every pixel. There is no build step here.
- **Tokens first:** `src/tokens/tokens.css` is the single restyle surface — a P0.5 design lock overrides tokens, never component internals. Light + dark are both first-class (`prefers-color-scheme` + `[data-theme]` override).
- **Config-driven record-core:** every entity is an `ObjectConfig` (fields, stage field, default view); tables/kanban/record pages render FROM config — a new entity is a config row, not a forked surface.
- Dependencies are ordinary MIT libraries (Radix behavior primitives, TanStack table/virtual, dnd-kit, lucide). No third-party source is vendored into this repo — see `PROVENANCE.md` (binding).
- Upstream ideas are tracked via read-only watch-forks (shadcn/ui, tweakcn, dyad, open-lovable) — ports are REAUTHORED into these conventions, never bulk-merged.

Consumed by: `nexus-app-starter` (see its `scripts/sync-ui.mjs`).
