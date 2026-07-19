# Provenance — nexus-ui

License intent: MIT once publication is decided (repo is PRIVATE-first by decision D11; no LICENSE file until then). Every path carries an origin tag here; `derived` entries carry their license + notice (see `NOTICE.md`) and are publication-compatible (MIT) — copyleft never enters this repo.

Origin tags: `ours` = authored from scratch · `rebuilt` = clean-room reauthored from written specs/ideas (spec cited) · `derived` = third-party source vendored verbatim (license + notice required).

| Path | Origin | Notes |
|---|---|---|
| src/components/ui/* | **derived — shadcn/ui, MIT © shadcn** | vendored VERBATIM from the registry (style `new-york-v4`) by `scripts/vendor-shadcn.mjs`; set + fetch date in `.vendor-manifest.json`; notices in `NOTICE.md`; local edits are FORBIDDEN here (they land in wrappers) — re-vendoring overwrites by design; upstream tracked via the read-only fork `github.com/achammah/ui` |
| src/primitives/* | ours | thin wrappers giving record-core/apps a stable API over the vendored components; all local styling opinions live here |
| src/tokens/tokens.css · src/styles/shadcn.css | ours | the Nexus token canvas + the shadcn semantic-variable bridge (a design lock restyles everything via tokens) |
| src/record-core/* | rebuilt | clean-room from the record-system interaction specs captured in the ATS postmortem workstream (record-page anatomy, kanban interaction model, table conventions — ideas/IA only; no third-party source consulted during authoring) |
| src/lib/utils.ts | derived — shadcn convention (cn), MIT | 4-line utility per the shadcn contract |
| scripts/vendor-shadcn.mjs | ours | the vendor-sync lever |

Dependencies (package.json) are ordinary MIT/ISC packages (radix-ui, cmdk, TanStack, dnd-kit, lucide, cva, clsx, tailwind-merge, tw-animate-css, Tailwind).

Carry-scan record (2026-07-19): the prior fork workstream's own-authored adapter package was reviewed and deliberately NOT carried — the starter's mock backend serves a generic record contract; record-system DESIGN carried as written specs only. No copyleft-derived file exists at any commit.
