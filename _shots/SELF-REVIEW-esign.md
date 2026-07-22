# Self-review — e-signature surface

Reference products: DocuSeal (open-source, docusealco/docuseal) and DocuSign. Verified against the dev harness on port 5441 at `reducedMotion: "no-preference"`; 51/51 journeys green.

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

## Honest gaps and seams

- **This is a product surface, not a compliance product.** Signing happens client-side against the snapshot. The certificate id is a SHA-256 over the terminal envelope state: it detects tampering with the snapshot you hold, but it is not a signature cryptographically bound to a verified identity. Identity verification, server-side sealing, timestamping authorities and evidence retention (eIDAS, ESIGN/UETA) are backend concerns. Stated in `docs/RECIPES.md` rather than implied away.
- **No IP/device metadata in the certificate.** A browser cannot observe its own IP, and inventing one would be fabricated evidence. That line belongs to the backend that receives `onSend`.
- **Delivery is a labeled seam.** Without `onSend` the surface performs a demo send: the envelope moves to `sent`, the audit records it, and the review dialog says plainly that no email is delivered. Reminders and expiry are recorded and handed to the seam, but nothing here can schedule mail.
- **Signing is local, not per-recipient.** Real recipients open their own emailed link; here you act for each signer from the Sign tab. The UI says so.
- **Validation is client-side only.** Re-run `fieldFormatError` server-side; it is a usability feature, not a trust boundary.
- **Not implemented:** multi-select and align/distribute across fields, snap-to-text, auto-detection of printed signature lines, multi-document envelopes, a page-thumbnail navigator. Field editing is one field at a time.
- **Adopted signatures live for the session only** — they are deliberately not persisted into the snapshot, since a stored signature image is a credential.
- **Templates key to roles by order**, so a template whose role count differs from the envelope's signer count is refused rather than partially applied.

## Bundle

Nothing PDF-related reaches the eager bundle. `LazyESignSurface` splits into the surface chunk plus CSS; `pdfjs` and its worker load only when a document opens, `pdf-lib` only on download. The eager exports (types, guards, `seedEnvelope`, `fieldFormatError`) are dependency-free and safe in Node.
