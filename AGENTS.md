# AGENTS.md — how an agent works in nexus-ui

You are in the org component library. Read order: this file → `docs/INDEX.md` (the catalog — every component, kind, import path, WHEN to use) → `docs/record-core.md` if you touch record surfaces. Machine-readable catalog: `docs/catalog.json` (grep/parse it instead of scanning source).

## Invariants (binding)
1. **`src/components/ui/*` is vendored shadcn source — NEVER edit it.** Re-vendoring (`npm run vendor:shadcn`) overwrites the whole dir by design. House opinions live in `src/primitives/` wrappers; a needed behavior change = a new wrapper, not a vendored-file edit.
2. **Styling flows through tokens only.** `src/tokens/tokens.css` (the `--nx-*` canvas) → `src/styles/shadcn.css` (bridge). An app's P0.5 design lock restyles the entire kit by overriding tokens. Never hardcode colors/sizes in components.
3. **Provenance is binding** (`PROVENANCE.md`): vendored = `derived` MIT (notices in `NOTICE.md`); record-core = `rebuilt` clean-room; no copyleft ever enters.
4. **After any vendor or wrapper change:** `node scripts/gen-docs.mjs` (the catalog is generated; a stale catalog is a defect), and add a WHEN line for every new component (the script errors the gap list).

## Common tasks
| Task | Do |
|---|---|
| Add a shadcn component | append its registry name to `COMPONENTS` in `scripts/vendor-shadcn.mjs` → run it → add its WHEN line in `scripts/gen-docs.mjs` → run gen-docs → bump deps if the script prints new registry deps |
| Refresh from upstream | `npm run vendor:shadcn` (upstream ideas tracked via the read-only fork `github.com/achammah/ui`) |
| Change the house look | edit `src/tokens/tokens.css` (both themes!) — never component files |
| New reusable control | wrapper in `src/primitives/` (or a record-core module) + export in `src/index.ts` + OURS row in `scripts/gen-docs.mjs` |
| Ship to consumers | consumers vendor `src/` (the starter runs `npm run sync-ui`); version note lands in their `src/ui/.ui-version` |

## Layout
`src/components/ui/` vendored shadcn (47) · `src/primitives/` house wrappers (Button, fields, overlays + primitives.css extras) · `src/record-core/` DataTable/Kanban/RecordPage + types + css · `src/tokens/` + `src/styles/` the canvas + bridge · `src/hooks/`, `src/lib/` vendored hook/lib files · `scripts/` vendor + gen-docs · `docs/` generated catalog + deep docs.
