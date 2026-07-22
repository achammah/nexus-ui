# Recipes

Wiring notes for the composable block surfaces — how to mount one, what it persists, and which seams you connect to a backend.

## E-signature (`ESignSurface`)

A DocuSeal-class signing surface: load a PDF, place fields on the pages, assign them to ordered signers, send for signature, sign (draw / type / upload), and download a flattened document with a completion certificate.

```tsx
import { Suspense } from "react";
import {
  LazyESignSurface,
  esignStoreKey,
  isEsignSnapshot,
  seedEnvelope,
  type EsignEnvelope,
} from "nexus-ui";

const KEY = esignStoreKey("contracts");            // -> "esign:contracts"

function ContractsPage() {
  const [env, setEnv] = useState<EsignEnvelope | null>(() => {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isEsignSnapshot(parsed) ? parsed : seedEnvelope();
  });

  return (
    <Suspense fallback={<div className="nxSkeleton" />}>
      <LazyESignSurface
        value={env}
        onChange={(snap) => { setEnv(snap); localStorage.setItem(KEY, JSON.stringify(snap)); }}
      />
    </Suspense>
  );
}
```

`value` + `onChange` + `reloadNonce` is the house surface contract: the surface is free-form, the host owns persistence. Everything — document bytes, fields, signers, audit trail, saved templates — round-trips as ONE JSON blob (`EsignEnvelope`), so a snapshot is self-contained and needs no external fetch to re-render.

Import `LazyESignSurface`, not the surface module: the PDF engines (`pdfjs-dist` to render, `pdf-lib` to flatten) load only inside that lazy chunk. The eager exports (types, guards, `seedEnvelope`) are dependency-free and safe to import in Node.

### Config

```ts
import type { ESignConfig } from "nexus-ui";

const config: ESignConfig = {
  title: "Customer contracts",
  fieldTypes: ["signature", "date", "text"],   // restrict the palette; default = all six
  signingOrder: "sequential",                  // or "parallel"
  signingUrlTemplate: "https://app.example.com/sign/{envelopeId}/{signerId}",
  onSend: async (req) => { await fetch("/api/envelopes/send", { method: "POST", body: JSON.stringify(req) }); },
};
```

| Key | Effect |
|---|---|
| `title` | surface title; defaults to the envelope name |
| `fieldTypes` | which field types the placement palette offers |
| `signingOrder` | default order for new envelopes — `sequential` gates each signer on the previous one, `parallel` opens to everyone at once |
| `signingUrlTemplate` | the per-recipient link shown in the review surface; `{envelopeId}` / `{signerId}` are substituted |
| `demoStates` | show the Draft / Partially signed / Completed switcher. Default `true`; set `false` in a real deployment |
| `onSend` | **the delivery seam** — see below |

### Demo states

`seedEnvelope(state)` returns a seeded envelope in one of three states, defaulting to `draft`:

```ts
seedEnvelope();             // draft — editable: place fields, edit signers, send
seedEnvelope("sent");       // partially signed — the provider signed, client's turn
seedEnvelope("completed");  // both signed, certificate issued
```

`seedDraftEnvelope` / `seedSentEnvelope` / `seedCompletedEnvelope` are exported directly too. The default is deliberately the **draft**: a sent envelope locks fields and signers (as a real one does once recipients hold it), so seeding one leaves a first-time visitor with a greyed-out palette and nothing to do.

### The delivery seam

Sending is an irreversible outward action, so it is always gated by a review surface that names the document, every recipient, their role, their field counts, and their signing link before anything happens.

Without `onSend`, the surface performs a **labeled demo send**: the envelope moves to `sent`, an audit event is written, and the UI states plainly that no email was delivered. Nothing is faked silently.

Wire `onSend` to deliver for real. It receives an `EsignSendRequest`:

```jsonc
{
  "envelopeId": "env-msa-2026-0142",
  "documentName": "esign-demo-contract.pdf",
  "signingOrder": "sequential",
  "recipients": [
    {
      "signerId": "signer-provider",
      "name": "Elena Vasquez",
      "email": "elena.vasquez@example.com",
      "role": "Provider",
      "order": 1,
      "fieldCount": 3,
      "requiredFieldCount": 3,
      "signingUrl": "https://app.example.com/sign/env-msa-2026-0142/signer-provider",
      "message": "Please double-check the fee schedule in Exhibit B before signing."
    }
  ],
  "cc": [{ "id": "cc-1", "name": "", "email": "legal@example.com" }],
  "reminders": { "everyDays": 7, "expiresInDays": 14 },
  "sentAt": "2026-07-22T09:31:00.000Z"
}
```

Your backend mails each recipient their `signingUrl` (including their `message`, if any) and, for `sequential` order, releases them one at a time as each signature lands. `cc` recipients get the completed document and no signing link. `reminders` is the cadence and expiry chosen in the review surface — enforce it on your side; the surface records the choice in the audit trail but cannot itself schedule mail.

### Field validation

Text fields carry a `format` (`any` / `email` / `number` / `phone` / `date`). A value that fails its format is flagged on the field and blocks completion, so a signer cannot return `abc` in an email field. `fieldFormatError(field)` is exported if you want to run the same check server-side — do run it there too; client-side validation is a usability feature, never a trust boundary.

### What the surface does and does not claim

This is a product surface, not a compliance product. Signing happens client-side against the snapshot: the certificate id is a SHA-256 over the terminal envelope state, which detects tampering with the snapshot you hold but is not a cryptographic signature bound to an identity. Identity verification, tamper-evident server-side sealing, timestamping authorities, and the evidence retention that eIDAS or ESIGN/UETA expect are backend concerns — put them behind `onSend` and your own signing service. Treat the built-in flow as the demo and preparation layer.
