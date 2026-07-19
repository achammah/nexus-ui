# Provenance — nexus-ui

License intent: MIT once publication is decided (repo is PRIVATE-first by decision D11; no LICENSE file until then). Every file carries an origin tag here; `derived` files may not ship to clients or publish until replaced by `rebuilt`.

Origin tags: `ours` = authored from scratch · `rebuilt` = clean-room reauthored from written specs/ideas (spec cited) · `derived` = traces to third-party source (license + notice required).

| Path | Origin | Notes |
|---|---|---|
| src/tokens/tokens.css | ours | blank Nexus canvas; light+dark first-class |
| src/primitives/* | ours | hand-authored on @radix-ui behavior primitives (Radix consumed as an MIT DEPENDENCY, not vendored source) |
| src/record-core/* | rebuilt | clean-room from the record-system interaction specs captured in the ATS postmortem workstream (record page anatomy, kanban interaction model, table conventions — ideas/IA only; no third-party source consulted during authoring) |
| src/icons/* | ours | thin lucide-react wrappers (lucide = MIT dependency) |

Dependencies (package.json) are ordinary MIT/ISC libraries (Radix, TanStack, dnd-kit, lucide) — consumed as packages, notices ride node_modules; no vendored third-party source files exist in this repo.

Carry-scan record (2026-07-19): the prior fork workstream's own-authored adapter package was REVIEWED and deliberately NOT carried — the starter's mock backend serves a generic record contract, so all server/UI code here is fresh (`ours`/`rebuilt`); the adapter remains an org-side asset in its own repo. Zero `derived` files exist at this commit.
