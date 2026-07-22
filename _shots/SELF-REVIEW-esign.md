# Self-review — e-signature surface

Reference products: DocuSeal (open-source, docusealco/docuseal) and DocuSign. Verified against the dev harness on port 5441 with `reducedMotion: "no-preference"`; 33/33 journeys green (`_shots/journey-results.json`).

## Per-feature verdict

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| 1 | Document intake — load a PDF, render pages, page nav, zoom | ✓ verified | file picker accepts PDF + PNG/JPEG, resets the envelope to `draft`; 2 pages render from real pdfjs output (pixel-checked, not presence-checked); prev/next + zoom 40–200% with fit-to-width on load and on resize. `esign-prepare-editing-light.png` |
| 2 | Field placement — 6 types, per-signer, required/optional | ✓ verified | drag from the palette **or** arm-and-click; drag to move, grip to resize, arrow keys to nudge, Delete to remove; fractional (0..1) geometry so placement survives zoom/DPI; props panel edits label/required/signer. `esign-prepare-editing-light.png`, `esign-prepare-locked-light.png` |
| 3 | Signers — ordered, sequential/parallel, colour-coded | ✓ verified | add/remove/reorder, role + email inline, 6-colour palette bound to the signer and mirrored on their fields; `sequential` gates each signer on the previous (journey asserts only signer 1 can act), `parallel` opens to all. `esign-sign-seed-light.png` |
| 4 | Send + sign flow | ✓ verified | review-gated send (below); signing supports **draw** (canvas, pointer + touch), **type** (styled font), **upload** (PNG/JPEG); date fields auto-fill today on focus; Finish stays disabled until every required field of that signer is filled. `esign-dialog-draw-light.png`, `esign-dialog-type-light.png`, `esign-signing-filled-light.png` |
| 5 | Audit trail + status | ✓ verified | 13 event types with actor + ISO timestamp; per-signer `pending/viewed/signed`, envelope `draft/sent/partially_signed/completed`; certificate id = SHA-256 over the terminal envelope state; download flattens every field onto the PDF and appends a certificate page (journey asserts 3 pages out of a 2-page source, 31 KB). `esign-completed-audit-light.png` |
| 6 | Templates | ✓ verified | save the current layout as a role-keyed template, apply it to another document (roles map onto signers in order, with a clear message when the signer count does not match). `esign-template-picker-light.png` |
| 7 | Architecture — house contract | ✓ verified | `value` + `onChange` + `reloadNonce`, ONE snapshot blob, `esignStoreKey`, `isEsignSnapshot`, `seedEnvelope()`; exported from `src/index.ts` |

## Bars

- **Config-composable** — `ESignConfig` (`title`, `fieldTypes`, `signingOrder`, `signingUrlTemplate`, `onSend`), documented in `docs/RECIPES.md`.
- **Tokens** — all chrome on `--nx-*`; the only fixed colours are ink-on-paper (field text, the signer chip ring, the modal scrim). The PDF page stays white paper in dark mode, as DocuSign/DocuSeal do — inverting a contract under the signer would be wrong.
- **Light + dark** — verified in both (`*-light.png` / `*-dark.png`).
- **Mobile** — 390×844 at dpr 3: rail stacks above the document, fit-to-width, no page-level horizontal scroll (asserted), drawn signature works via pointer events. `esign-mobile-sign-light.png`, `esign-mobile-sign-dark.png`.
- **Keyboard + a11y** — dialogs are `role="dialog" aria-modal`, every control labelled, fields are focusable with arrow-key nudge; signature/type tabs are real tabs.
- **Irreversible action** — sending is never a bare button. The review surface names the document, page + field counts, and every recipient with role, field counts (total and required) and signing link, states that sending locks fields and signers, and offers Cancel. After sending, status and the audit trail are the verifiable result state. `esign-send-review-light.png`.
- **Demo density** — the seed is a real 2-page MSA with two signers, one already signed, 8 placed fields, a 5-event history and a saved template, so every surface has content on first paint.

## Bug found and fixed this pass

The PDF painted **saturated or vertically mirrored** whenever a canvas was asked to re-render before its previous pdfjs task finished. Fit-to-width does exactly that on any narrow pane, so every phone hit it; a wide viewport at 100% zoom never re-renders and hid it completely — which is why it survived a green 32/33 suite.

Renders are now exclusive per canvas (cancel the live task, let it settle, then start the next; `PageView` cancels on unmount). The journey gained a guard that runs in a **cold** browser context and reproduces the race deterministically — I verified it fails without the fix (`top 152062 / bottom 151088` ink, a saturated canvas) and passes with it (`6053 / 667`). A guard I had written first passed in both states and was rewritten rather than kept.

## Honest gaps and seams

- **This is a product surface, not a compliance product.** Signing happens client-side against the snapshot. The certificate id detects tampering with the snapshot you hold; it is not a signature cryptographically bound to a verified identity. Identity verification, server-side sealing, timestamping authorities and evidence retention (eIDAS, ESIGN/UETA) are backend concerns. Stated plainly in `docs/RECIPES.md` rather than implied away.
- **Delivery is a labeled seam.** Without `onSend` the surface performs a demo send: the envelope moves to `sent` and the UI says in the review dialog and the audit trail that no email was delivered. Nothing is silently faked. `EsignSendRequest` carries the real payload a mailer needs.
- **Signing is local, not per-recipient.** Real recipients open their own emailed link; here you act for each signer from the Sign tab. The UI says so.
- **Not implemented:** decline-to-sign (the audit type exists, no UI), field-level conditional logic, multi-document envelopes, reminders/expiry, drag-select of multiple fields.
- **`dropdown` fields** are placeable and fillable, but options are edited only in the props panel one at a time.
- Templates key to roles by order; a template whose role count differs from the envelope's signer count is refused with a message rather than partially applied.

## Bundle

Nothing PDF-related reaches the eager bundle. `LazyESignSurface` splits into `ESignSurface` 41.8 KB (12.5 KB gz) + CSS 20.3 KB (3.7 KB gz); `pdfjs` 365 KB (107 KB gz) and its 1.38 MB worker load only when a surface actually opens a document; `pdf-lib` loads only on download. The eager exports (types, guard, `seedEnvelope`) are dependency-free and safe in Node.
