# Provenance — nexus-ui

License: **MIT, PUBLIC** since 2026-07-19 (see the Publication note below; the earlier private-first posture is superseded). Every path carries an origin tag here; `derived` entries carry their license + notice (see `NOTICE.md`) and are publication-compatible (MIT) — copyleft never enters this repo.

Origin tags: `ours` = authored from scratch · `rebuilt` = clean-room reauthored from written specs/ideas (spec cited) · `derived` = third-party source vendored verbatim (license + notice required).

| Path | Origin | Notes |
|---|---|---|
| src/components/ui/* | **derived — shadcn/ui, MIT © shadcn** | vendored VERBATIM from the registry (style `new-york-v4`) by `scripts/vendor-shadcn.mjs`; set + fetch date in `.vendor-manifest.json`; notices in `NOTICE.md`; local edits are FORBIDDEN here (they land in wrappers) — re-vendoring overwrites by design; upstream tracked via the read-only fork `github.com/achammah/ui` |
| src/primitives/* | ours | thin wrappers giving record-core/apps a stable API over the vendored components; all local styling opinions live here |
| src/tokens/tokens.css · src/styles/shadcn.css | ours | the Nexus token canvas + the shadcn semantic-variable bridge (a design lock restyles everything via tokens) |
| src/record-core/* | rebuilt | clean-room from the record-system interaction specs captured in the ATS postmortem workstream (record-page anatomy, kanban interaction model, table conventions — ideas/IA only; no third-party source consulted during authoring) |
| src/blocks/{login-03,sidebar-07} | **derived — shadcn/ui blocks, MIT © shadcn** | copy-out EXAMPLE tissue, flattened per block, vendored by the same script; never a runtime import |
| src/blocks/document/* | ours | the Notion×Google-Docs document surface (DocumentSurface + snapshot), authored from scratch over the record-core NotionEditor — no third-party source lifted; its only heavy deps (docx, mammoth) are ordinary npm packages, lazy-loaded (see below) |
| src/lib/utils.ts | derived — shadcn convention (cn), MIT | 4-line utility per the shadcn contract |
| scripts/vendor-shadcn.mjs | ours | the vendor-sync lever |

Dependencies (package.json) are ordinary permissive packages (radix-ui, cmdk, TanStack, dnd-kit, lucide, cva, clsx, tailwind-merge, tw-animate-css, Tailwind — MIT/ISC; **docx** — MIT, for .docx export; **mammoth** — BSD-2-Clause, for .docx import). docx + mammoth are consumed only behind dynamic `import()` inside `src/record-core/editor-io.ts`, so they never enter the base bundle. No copyleft.

Carry-scan record (2026-07-19): the prior fork workstream's own-authored adapter package was reviewed and deliberately NOT carried — the starter's mock backend serves a generic record contract; record-system DESIGN carried as written specs only. No copyleft-derived file exists at any commit.

**Publication (2026-07-19):** licensed MIT and made PUBLIC on the user's decision — provenance verified publication-clean at flip time (no copyleft-derived file has ever entered this repo; shadcn/ui source is MIT with notices in NOTICE.md).
