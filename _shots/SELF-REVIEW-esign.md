# Self-review — e-signature surface

Reference products: DocuSeal (open-source, docusealco/docuseal) and DocuSign. Verified against the dev harness on port 5441 at `reducedMotion: "no-preference"`; 51/51 base journeys + 24/24 drafting journeys green.

## Round 3 — "you can't edit the document" (the toy verdict, and what changed)

The user's second verdict: *"it still feels partially like a toy, because ideally you can edit a word doc directly there, same as a pdf before sending."* Accurate again — the document itself was read-only; any wording fix meant a round-trip through Word. What changed:

- **DRAFTING** — the envelope now composes the document block (`DocumentSurface`: the repo's Notion×Word editor with tracked changes and docx import/export) as an Edit tab. A `.docx` dropped on the intake imports straight into it (mammoth); "Draft a document in the editor" starts from blank; the seed envelope ships with the MSA as editable text.
- **FREEZE** — "Freeze & place fields" renders the draft to real PDF bytes (a pdf-lib paginator) and makes it the signing base. Verified end-to-end by editing "thirty (30) days" → "twenty (20) days" in the editor and extracting the text back out of the frozen PDF (pdfjs `getTextContent`): the edit is in the bytes. Pending tracked changes block the freeze; editing after a freeze marks it stale and BLOCKS SEND until re-frozen.
- **PDF amend/redact** — for an uploaded PDF with no source, White-out + Correction tools place paper-real overlays that are baked into the PDF bytes at send (verified: bytes change, overlay list clears, `document_amended` lands in the audit, the baked PDF parses). The boundary is stated in the UI: this covers and corrects, it does not reflow the PDF's own text — full rewording needs the source document.
- **SENT freeze** — the state machine is DRAFTING → PREPARING → SENT: after send the Edit tab flips to a read-only "Document" view (asserted: zero contenteditable regions, no freeze button, document bytes byte-identical across further UI activity). Honest limit: this freeze is CLIENT-side discipline over a client-side snapshot — anyone holding the blob can alter it. Verifiable immutability (hashing at send, sealed storage) belongs to the `onSend` backend, same as the audit record (Limits §1).

Honest fidelity note: the freeze renderer is print-class (headings, lists, todos, quotes, callouts, code, simple tables, bold), deliberately not Word-identical — no columns, images as placeholders, single font family. The UI says "print-class layout, not Word-identical" rather than pretending.

| New feature | Verdict | Evidence |
|---|---|---|
| .docx import → edit in place | ✓ verified | real docx fixture (built with `docx`) imports; heading + fee clause present; `esign-draft-docx-light.png` |
| Edit the contract text, no Word round-trip | ✓ verified | 45→30 days edit landed in the draft, then in the frozen PDF's extracted text |
| Freeze → signing base | ✓ verified | render + page open + fields survive (page-filtered), values/statuses reset; `esign-frozen-prepare-light.png` |
| Stale-freeze send gate | ✓ verified | edit-after-freeze disables Send with the reason on the button title |
| Tracked changes gate | ✓ verified | a pending suggestion blocks the freeze with a count and no `document_frozen` event lands; `esign-freeze-blocked-suggestions-light.png` |
| PDF white-out + correction | ✓ verified | placed, typed, review discloses "2 document amendments", baked at send; `esign-amend-pdf-light.png`, `esign-amend-baked-sent-light.png` |
| SENT immutability (client-side) | ✓ verified | read-only editor, no freeze, byte-identical document after further activity; `esign-sent-locked-draft-light.png` |
| Draft pane light/dark/mobile | ✓ verified | `esign-draft-seed-{light,dark}.png`, `esign-draft-mobile-light.png` (0px page overflow) |

The user's verdict on the first version was that it felt like a widget with all the features missing. That was accurate, and the cause was a single defect described below. This review is written after the rework, and does not claim the verdict is resolved — the user judges that.

## The defect that produced the verdict

`seedEnvelope()` seeded a **partially signed** envelope. A sent envelope correctly locks fields and signers, so the Prepare tab disabled everything: the field palette greyed out and undraggable, signers locked, templates inert, no send action. Every capability that had been built was present and switched off, and a first-time visitor could not do anything at all.

I had seen this state in my own screenshots and named one of them `esign-prepare-locked-light.png` without once asking whether a visitor could act. The lock logic was right; the seed was wrong.

Now the default seed is a **draft** — palette live, fields placeable, signers editable, send available — with the downstream states reachable through a demo-state switcher (Draft / Partially signed / Completed), and the locked banner carries a "Start a new draft" way out. Four journey assertions fail if the demo ever lands locked again.

## Per-feature verdict

| Feature | Verdict | Evidence |
|---|---|---|
| Arrives workable | ✓ verified | lands `Draft`, palette enabled, send present, no lock banner; asserted 4 ways. `esign-prepare-draft-light.png` |
| Document intake | ✓ verified | own PDF or image via Replace, resets to draft; pages render from real pdfjs output (pixel-checked); page nav; zoom 40–200% |
| Document fills its stage | ✓ verified | fit-width now scales up as well as down (capped at 150%), so the page is the subject of the surface rather than a small sheet in grey |
| Field placement | ✓ verified | drag from palette or arm-and-click; move, resize, arrow-key nudge, delete; duplicate; apply to all pages (idempotent); fractional geometry survives zoom/DPI |
| Fields read as owned objects | ✓ verified | type icon, label, required marker, signer name, signer colour. `esign-prepare-fields-light.png` |
| Field properties | ✓ verified | label, assignee, required, placeholder, format validation, tab order, dropdown options. `esign-field-props-light.png` |
| Validation | ✓ verified | email/number/phone/date; invalid value flagged on the field and blocks finishing; clears when corrected |
| Signers | ✓ verified | add/remove/reorder, roles, per-signer note, CC recipients, sequential vs parallel with the routing stated in words |
| Send | ✓ verified | review surface names document, page and field counts, every recipient with role, field counts, signing link; reminders + expiry; CC listed; demo mode labeled. `esign-send-review-policy-light.png` |
| Signing | ✓ verified | draw / type / upload, adopt-once-and-reuse, progress bar, guided next-required-field, date auto-fill, decline with reason. `esign-signing-guided-light.png` |
| Completion | ✓ verified | per-signer and envelope status transitions, audit trail, SHA-256 certificate id, flattened PDF download with a certificate page appended (asserted: 3 pages out of a 2-page source) |
| Templates | ✓ verified | save the current layout keyed to roles, apply to another document, refused with a message when the signer count differs |
| Icons | ✓ verified | lucide throughout; the emoji palette glyphs are gone |
| Light + dark | ✓ verified | `esign-prepare-fields-dark.png` and others |
| Mobile | ✓ verified | 390×844 at dpr 3: rail stacks, fit-to-width, no page-level horizontal scroll (asserted), drawn signature works |

## Bugs found and fixed during this work

**Mirrored PDF.** A canvas re-rendered before its previous pdfjs task finished ended up with a corrupted transform and painted the page saturated or upside down. Fit-to-width triggers exactly that on any narrow pane, so every phone hit it; a wide viewport at 100% never re-renders and hid it completely — a green 32/32 suite and every screenshot missed it. Renders are now exclusive per canvas. The guard runs in a cold browser context and was verified to fail without the fix and pass with it.

**A guard that could not fail.** My first regression guard for that bug passed in both the broken and fixed states. I rewrote it rather than keep it. Likewise a validation assertion I wrote as `>= 0` (always true) was replaced with one that actually asserts the invalid state, the block, and the recovery.

## Limits — what you must add before this is a signing system

Written for someone adopting this surface who did not build it. Each item says what is true, what breaks if you ignore it, and what to do.

### 1. The certificate is not legal evidence — build the audit record server-side

**What it is:** `certificateId` is a SHA-256 over the terminal envelope state (envelope id, document name, each signer's id/email/`signedAt`, each field's id/type/page/filled-flag, `completedAt`). Recomputing it over a snapshot tells you that snapshot has not been altered.

**What it is not:** it is not bound to a verified identity, not countersigned by anyone, and not timestamped by an authority. Anyone holding the snapshot can produce a matching certificate, because the input is the snapshot itself.

**What is missing and cannot be added here:** IP address, user agent provenance you can trust, geolocation, an authenticated identity, and a trusted timestamp. A browser cannot observe its own IP, and a client-declared one is worthless as evidence — writing one into a certificate of completion would be fabricating an audit record, which in a signing product is a corrupt record rather than a cosmetic lie. This surface therefore emits none.

**Do this:** treat `onSend` as the boundary where the real record begins. Your backend issues the signing links, and records per recipient, at the moment they act: source IP, user agent, authentication method and identity, and a server clock (ideally an RFC 3161 timestamp). Store that server-side and treat it as authoritative. Use the client audit trail as a UX convenience, never as the evidence of record. Under eIDAS or ESIGN/UETA the evidence, identity binding and retention obligations all sit on that backend.

### 2. What the flatten does and does not preserve

Verified by running a probe PDF (an AcroForm text field, a link annotation, document metadata) through the real download path and comparing before and after with `pdf-lib`:

| | Source | After flatten |
|---|---|---|
| Original pages | 1 | 1, plus an appended certificate page |
| Page geometry | 612×792 | 612×792, unchanged |
| Existing AcroForm fields | `existing.customerRef` | `existing.customerRef` — **still present and still interactive** |
| Page annotations (incl. links) | 2 | 2, preserved |
| Metadata (title/author/subject) | present | preserved |
| E-signature field values | — | painted as page content (text and embedded images); no new form fields |

**The one that will surprise you:** "flatten" describes *our* field values only. They are drawn onto the page and cannot be edited afterwards. The document's **own pre-existing form fields are carried through untouched and remain fillable** — so if your source PDF is an interactive form, the delivered document still has editable fields in it, and a recipient can change them after completion. Nothing detects that today.

**Do this:** if your sources contain AcroForm fields, flatten them server-side after download (pdf-lib's `form.flatten()`, qpdf, or your PDF service) before you archive or distribute. If you need the delivered artifact to be tamper-evident, seal it server-side; the client output is not sealed.

Also true of the current flatten: typed signatures are rendered to an image at flatten time using a browser canvas, so the exact glyph shapes depend on the fonts available on the signing machine. The stored snapshot keeps the typed text and font name, so a server-side re-render is possible and will be more consistent.

### 3. Delivery, signing and validation are all seams

- **Delivery.** Without `onSend` the surface performs a demo send: the envelope moves to `sent`, the audit records it, and the review dialog states that no email is delivered. `reminders` and `cc` are carried in `EsignSendRequest` and recorded, but nothing here can schedule or send mail — your backend must.
- **Signing is local, not per-recipient.** Real recipients open their own emailed link; here you act for each signer from the Sign tab, which the UI says plainly. There is no per-recipient authentication in this surface.
- **Validation is client-side only.** `fieldFormatError` is exported — re-run it on the server. It is a usability feature, never a trust boundary.
- **Adopted signatures live for the session only.** They are deliberately not written into the snapshot: a stored signature image is a credential, and persisting it into a blob that gets passed around is a leak waiting to happen. If you want a saved signature, store it against an authenticated user server-side.

### 4. Not implemented (scoped out, not overlooked)

Multi-select and align/distribute across fields, snap-to-text, auto-detection of printed signature lines, multi-document envelopes, and a page-thumbnail navigator. Field editing is one field at a time. Templates key to roles by order, so a template whose role count differs from the envelope's signer count is refused rather than partially applied.

## Bundle

Nothing PDF-related reaches the eager bundle. `LazyESignSurface` splits into the surface chunk plus CSS; `pdfjs` and its worker load only when a document opens, `pdf-lib` only on download. The eager exports (types, guards, `seedEnvelope`, `fieldFormatError`) are dependency-free and safe in Node.
