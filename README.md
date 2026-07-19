# nexus-ui

The org component library: a blank Nexus token canvas + accessible primitives + the **record-core** (data table · kanban · record page) that record-system apps (CRM/ATS/ticketing-class) are built from.

- **Distribution = SOURCE** (the shadcn model): consumers vendor `src/` (the starter ships a synced copy under `src/ui/`) and own every pixel. There is no build step here.
- **Tokens first:** `src/tokens/tokens.css` is the single restyle surface — a P0.5 design lock overrides tokens, never component internals. Light + dark are both first-class (`prefers-color-scheme` + `[data-theme]` override).
- **Config-driven record-core:** every entity is an `ObjectConfig` (fields, stage field, default view); tables/kanban/record pages render FROM config — a new entity is a config row, not a forked surface.
- Dependencies are ordinary MIT libraries (Radix behavior primitives, TanStack table/virtual, dnd-kit, lucide). No third-party source is vendored into this repo — see `PROVENANCE.md` (binding).
- Upstream ideas are tracked via read-only watch-forks (shadcn/ui, tweakcn, dyad, open-lovable) — ports are REAUTHORED into these conventions, never bulk-merged.

Consumed by: `nexus-app-starter` (see its `scripts/sync-ui.mjs`).
