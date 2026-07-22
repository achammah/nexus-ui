# blocks/esign — how this folder works

True at commit `cbfe36b` (branch `feat/esignature`). If you are reading this on main after a merge, the mechanism below is what was merged; re-verify file names against the FILE MAP before editing.

## What this is

A DocuSeal-class e-signature surface (reference product: docusealco/docuseal). One React block that runs the whole envelope lifecycle client-side, over ONE JSON snapshot the host persists:

```
DRAFTING (editable document)  →  PREPARING (fields on a frozen PDF render)  →  SENT → PARTIALLY_SIGNED → COMPLETED
        ↑ .docx import / blank draft         ↑ PDF/image upload joins here          (immutable document from SENT on)
```

It is a free-surface block on the workbook/document contract: `value` + `onChange` + `reloadNonce`, snapshot stored under `esignStoreKey(pageKey)` (`"esign:" + pageKey`), guarded by `isEsignSnapshot()`, seeded by `seedEnvelope()`. There is NO backend in this folder: delivery, identity, evidence and sealed storage are all seams (see SEAMS and INVARIANTS).

The document-editing half is COMPOSITION, not a second editor: the Edit tab mounts `DocumentSurface` from `../document` (Notion×Word block editor — tracked changes, mammoth `.docx` import). This folder only owns the envelope semantics around it (freeze, staleness, locking).

## File map

| File | What it is |
|---|---|
| `snapshot.ts` | The whole data model + pure logic: envelope/field/signer/annotation/template/audit types, store key, guard, seeds (3 demo states), status transitions, certificate hash, field validation. Dependency-free, node-testable, in the eager bundle. |
| `ESignSurface.tsx` | The surface (default export, lazy-loaded). All state, all tabs (Edit/Prepare/Sign/Activity), field + annotation placement, send review dialog, signing flow, template save/apply. ~1.8k lines; sub-components `PageView`, `FieldBox`, `AnnotationBox` live at the bottom. |
| `pdf.ts` | Lazy pdf engines. pdfjs render (`openDocument`), file intake probe (`fileToEsignDocument`), flatten-on-download (`flattenEnvelope`), draft→PDF freeze renderer (`blocksToPdfBytes`), amendment baking (`bakeAnnotations`), base64 helpers. Only ever imported inside the lazy chunk. |
| `SignatureDialog.tsx` | Draw (pointer canvas) / type (3 font presets) / upload capture; returns `EsignSignatureValue`. `signatureFontCss()` maps a stored font id to CSS. |
| `seed-pdf.ts` | GENERATED — the demo MSA as an embedded base64 PDF. Regenerate with `scripts/gen-esign-seed-pdf.mjs` only when the demo contract copy changes (the seed must stay sync-callable). |
| `esign.css` | Every pixel of chrome, all `--nx-*` tokens. The PAGE is deliberately paper-white in both themes; amendments render opaque white ("paper-real: preview = baked outcome"). |
| `index.ts` | Eager exports (types, guard, seeds, helpers) + `LazyESignSurface = React.lazy(...)`. Do NOT add an eager re-export of the surface — that drags pdfjs/pdf-lib into the base bundle. |

Journeys live outside the package: `dev-esign/journey.mjs` (51 checks, core flow) and `dev-esign/journey-draft.mjs` (24 checks, drafting/freeze/amend/immutability), run against the untracked vite harness in `dev-esign/`.

## The model

**Envelope** (`EsignEnvelope`, `kind:"esign-envelope"`, `v:1`) is the single unit of persistence. Everything — document bytes (base64), the editable source, fields with values, signers with statuses, the audit trail, saved templates — rides in it. That makes the snapshot self-contained (no fetches, survives export/import) and also means it can get large: the document is IN the blob.

**Field geometry is FRACTIONAL.** `EsignField{x,y,w,h}` are 0..1 fractions of the page box, `y` measured from the page TOP. This is the one convention that keeps placement stable across zoom, DPI, re-render and export:
- the viewer multiplies by the rendered page size (`pct()` in `ESignSurface.tsx` — fields are absolutely positioned in a `%`-sized layer over the canvas);
- drag/resize convert pixel deltas back through the LAYER's `getBoundingClientRect()`, so they are zoom-agnostic;
- flatten (`flattenEnvelope`) and baking (`bakeAnnotations`) multiply by the PDF page size in points and flip to pdf-lib's bottom-left origin: `yPdf = pageH - y*pageH - h*pageH`. If you touch any consumer of geometry, keep all three in agreement — a new consumer that assumes pixels or top-left PDF origin will look right at one zoom level and be wrong everywhere else.

**Signers and turn order.** `EsignSigner.order` is 1-based; `signingOrder` is `"sequential" | "parallel"`. `activeSignerIds()` (snapshot.ts) is the single source of "whose turn": parallel → every unsigned signer, sequential → the first unsigned in order. `envelopeStatusAfterSign()` derives the envelope status from signer statuses. Never compute turn/status inline in the surface — extend those two functions.

**The state machine** (who may change what):

| Stage | Detectable as | Document | Fields/signers | Draft (source) |
|---|---|---|---|---|
| DRAFTING | `status==="draft"` && `source` && (no `document` or working in Edit tab) | regenerated by freeze | editable | editable (DocumentSurface) |
| PREPARING | `status==="draft"` && `document` | replaceable (upload/re-freeze); amendable via annotations | editable | editable, but `dirtySinceFreeze` gates Send |
| SENT / PARTIALLY_SIGNED | `status` | **immutable** — annotations were baked into the bytes at send | locked (`editable = status==="draft"` everywhere) | read-only (`DocumentSurface readOnly`) |
| COMPLETED | `status==="completed"` | immutable + `certificateId` issued | locked | read-only |

Irreversible transitions: **send** (locks everything; the only way "back" in the demo is the demo-state switcher loading a fresh seed) and **complete** (issues the certificate hash). `loadFile`/`freezeDraft` deliberately reset signer statuses and field values — a new base document starts a fresh signing round; that reset is a correctness feature, not a bug.

**Persistence & consumers.** The host owns storage. The dev harness uses `localStorage`; the intended host is a Pages-style app storing the blob under `esignStoreKey(pageKey)`. Nothing else in the repo reads the snapshot today; if you add a reader, go through `isEsignSnapshot()` and treat unknown fields as forward-compatible (optional fields were added in-place at `v:1` — `source`, `annotations`, `cc`, `reminders` are all optional on older blobs).

## Seams (how a host extends this)

All on `ESignConfig` (snapshot.ts) unless noted:

- **`onSend(req: EsignSendRequest)`** — THE seam. Without it the surface does a labeled demo send (audit event only; the review dialog says so in caps). With it, you get the exact payload a mailer/backend needs: recipients in order with per-recipient field counts, signing URLs (from `signingUrlTemplate`), per-recipient messages, `cc`, `reminders{everyDays,expiresInDays}`. Throwing from `onSend` aborts the send and surfaces the error. This is also where the REAL audit record must begin (see INVARIANTS).
- **`signingUrlTemplate`** — `"https://…/{envelopeId}/{signerId}"`; only interpolated into the review surface + send payload. The demo default is `demo://…` on purpose (unclickable ≠ fake-real).
- **`fieldTypes`** — restrict the palette (e.g. signature-only).
- **`title`, `signingOrder`** — cosmetic default overrides.
- **`demoStates`** — the Draft/Partially-signed/Completed switcher. Defaults ON so a visitor is never stranded in a locked envelope; set `false` in any real deployment.
- **`actions` prop** — host controls rendered into the header (save state, reset, theme).
- **Swappable pieces**: the drafting editor is `DocumentSurface` behind a narrow usage (value/onChange/readOnly/author/config) — a host theming or configuring the document block affects the Edit tab for free. The pdf engines are isolated in `pdf.ts`; swapping pdfjs for another renderer means reimplementing `openDocument`'s `PdfDocHandle` only.

Validation (`fieldFormatError`) and the certificate (`computeCertificateId`) are exported so a backend can RE-RUN them server-side — client results are UX, never a trust boundary.

## How to add X

**A new field type (e.g. "stamp")**
1. `snapshot.ts`: add the literal to `EsignFieldType`; add a variant to `EsignFieldValue`; extend `FIELD_DEFAULT_SIZE`, `FIELD_TYPE_LABEL`, and `isFieldFilled()`.
2. `ESignSurface.tsx`: add an icon to `FIELD_TYPE_ICON`; add a case to `FieldBox`'s `fillControl()` (how a signer fills it) and, if it renders a value in view mode, to `SignatureOrValue`. `placeField` needs a case only if its defaults (required-ness, extra props like `options`) differ.
3. `pdf.ts` `flattenEnvelope()`: add a draw case — without it the value silently never reaches the downloaded PDF (this is exactly the class of gap the flatten trap below describes).
4. Add a journey assertion in `dev-esign/journey.mjs` (place → fill → flatten) — every existing type is covered; a new one without a check will rot.

**Wire real delivery/email**
1. Pass `config.onSend` and `config.signingUrlTemplate` from the host. Build the mail from `EsignSendRequest` — do not re-derive counts from the envelope; the request is computed at confirm time after amendments are baked.
2. Host a signing route that loads the envelope, calls the surface with the recipient pre-selected (today: `startSigning(signerId)` is internal — expose a `config.signAs` if you need deep-linking; that is a ~10-line seam addition in `ESignSurface`).
3. Record server-side, at act time: IP, UA, authenticated identity, server clock. The client audit trail is UX only.
4. Schedule `reminders` yourself; the surface only records the policy.

**A new envelope stage (e.g. "voided")**
1. `snapshot.ts`: extend `EsignEnvelopeStatus` + `STATUS_LABEL` (surface) + `envelopeStatusAfterSign()` if reachable from signing; add an `EsignAuditEvent["type"]` literal and write the transition through `appendEvent()` so the trail stays complete.
2. Decide lock semantics: everything keys off `editable = status === "draft"` — a new stage is locked unless you deliberately widen that predicate. Widen it in ONE place only.
3. Add the stage to `envMatchesSeed()`/`ESIGN_SEED_STATES` only if the demo switcher should reach it.

## Invariants and traps

- **THE FLATTEN TRAP (correctness, will ship unnoticed): `flattenEnvelope()` flattens OUR field values only — it paints them as page content. The source PDF's own AcroForm fields are carried through UNTOUCHED and remain interactive: a delivered "signed & completed" PDF whose source was an interactive form is still editable by the recipient.** Nothing here detects it. If sources may contain form fields, flatten server-side after download (pdf-lib `form.flatten()`, qpdf) before archiving/distributing. General form of the rule: a "finished" artifact is only finished where you VERIFIED it — we verified geometry, annotations, links and metadata survive; we verified our values become non-editable content; we verified pre-existing fields DON'T.
- **SENT immutability is client-side discipline, not proof.** The surface stops mutating the document from SENT on (journey-asserted byte-identical), but anyone holding the snapshot blob can edit it and recompute a matching certificate — `certificateId` hashes the snapshot itself, so it proves integrity of a copy, not authenticity. Evidence-grade freeze (hash recorded at send, sealed storage, trusted timestamp) belongs behind `onSend`.
- **Geometry has three consumers** (viewer overlay, flatten, bake) and one convention (fractions, top-origin; PDF flip at the pdf-lib boundary). Never store pixels; never "fix" a misplacement by fudging one consumer.
- **Freeze must not run over unsettled text**: pending tracked changes block `freezeDraft()` (count surfaced, no `document_frozen` event). Keep that gate — a signing base with half-accepted suggestions is a silently wrong contract.
- **`dirtySinceFreeze` gates Send, not editing.** Editing after freeze is legal (that's the point); sending a stale render is not. If you add a new path that mutates `source.snapshot`, it must set `dirtySinceFreeze: true` (today the only writer is `onDraftChange` + docx import).
- **Every user-meaningful mutation goes through `appendEvent()`.** An action that skips the audit trail (silent bake, silent reset) breaks the product's core promise. Baking at send emits `document_amended` BEFORE `sent`, in one commit.
- **Amendments are OWNER tools and must bake at send.** They render opaque-white in the UI precisely because that is the baked outcome; if you add an annotation kind, add its `bakeAnnotations()` case in the same change or the preview lies. White-out is visual covering, NOT content removal — the text under a white-out is still in the PDF's content stream (redaction-grade removal is a server job); do not rename it "redact".
- **Bundle discipline**: `snapshot.ts` and `index.ts` stay dependency-free; pdfjs/pdf-lib/mammoth/docx only ever load inside the lazy chunk (pdf.ts dynamic imports; DocumentSurface's io is itself lazy). `npm run` a harness build if unsure — the pdf worker chunk should stay separate.
- **Seed regeneration**: `seed-pdf.ts` is generated; hand-editing it desyncs the printed signature wells from the seed field coordinates in `seedSentEnvelope()` (they mirror each other by explicit point math — `px(64)`, line y=300pt etc.).

## Limits (current, honest)

- **Freeze fidelity is print-class, not Word-identical** — single font family, no columns, images as placeholders, simple tables. Stated in the UI. Fix path: a real layout engine server-side (LibreOffice headless, like DocuSeal) behind a seam; the client paginator is a demo-grade renderer.
- **PDF amendment does not reflow text** (covers/overlays only) — stated in the UI; full rewording needs the source document.
- **No per-recipient authentication** — the Sign tab acts for every recipient, labeled as demo behavior. Real recipients need the `onSend` + signing-route setup above.
- **No legal-evidence claims** — the certificate documents the demo flow; the eIDAS/ESIGN evidence chain (identity, IP, trusted time, retention) is a backend obligation. This is a product demo surface, not a claim of legal compliance.
- **Typed signatures rasterise with the signing machine's fonts** — snapshot keeps text+font id, so a server re-render is available for consistency.
- **Scoped out** (listed, not forgotten): multi-select/align/distribute of fields, snap-to-text, printed-signature-line detection, multi-document envelopes, page thumbnails. Templates refuse (not partially apply) when the role count mismatches.
