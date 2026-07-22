// E-signature block — types + snapshot contract. Mirrors the workbook block:
// the surface is free-form, the host owns persistence, and the whole envelope
// (document, fields, signers, audit trail, templates) round-trips as ONE JSON
// snapshot blob under a namespaced app-state key.
//
// Reference product: DocuSeal (docuseal.co, open-source DocuSign class). This
// module is dependency-free; the pdf engines (pdfjs-dist for render, pdf-lib for
// flatten) load lazily inside the surface chunk only.

/* ---------------------------------------------------------------- store key */

export const ESIGN_STORE_PREFIX = "esign:";
export const esignStoreKey = (pageKey: string): string => `${ESIGN_STORE_PREFIX}${pageKey}`;

/* --------------------------------------------------------------------- types */

export type EsignFieldType = "signature" | "initials" | "date" | "text" | "checkbox" | "dropdown";

export type EsignSignerStatus = "pending" | "viewed" | "signed";
export type EsignEnvelopeStatus = "draft" | "sent" | "partially_signed" | "completed";
export type EsignSigningOrder = "sequential" | "parallel";

/** How a signature/initials value was produced. */
export interface EsignSignatureValue {
  kind: "drawn" | "typed" | "uploaded";
  /** drawn/uploaded: a PNG data URL; typed: rendered at flatten time from `text` */
  dataUrl?: string;
  /** typed signatures keep the raw text + the display font */
  text?: string;
  font?: string;
  at: string; // ISO timestamp
}

export type EsignFieldValue =
  | { type: "signature"; signature: EsignSignatureValue }
  | { type: "initials"; signature: EsignSignatureValue }
  | { type: "date"; text: string }
  | { type: "text"; text: string }
  | { type: "dropdown"; text: string }
  | { type: "checkbox"; checked: boolean };

/** A placed field. Geometry is FRACTIONAL (0..1 of the page box) so placement is
 *  zoom- and DPI-independent; the viewer multiplies by the rendered page size. */
export interface EsignField {
  id: string;
  type: EsignFieldType;
  page: number; // 0-based
  x: number; y: number; w: number; h: number; // fractions of page width/height
  signerId: string;
  required: boolean;
  label?: string;
  options?: string[]; // dropdown
  /** shown inside an empty text field while signing */
  placeholder?: string;
  /** input validation for text fields — enforced at fill time */
  format?: EsignFieldFormat;
  /** position in the signer's tab order; unset = reading order (page, then y) */
  tabIndex?: number;
  value?: EsignFieldValue;
}

/** Validation applied to a text field's value. */
export type EsignFieldFormat = "any" | "email" | "number" | "phone" | "date";

export const FIELD_FORMAT_LABEL: Record<EsignFieldFormat, string> = {
  any: "Any text",
  email: "Email address",
  number: "Number",
  phone: "Phone number",
  date: "Date (YYYY-MM-DD)",
};

const FORMAT_RULE: Record<EsignFieldFormat, { test: (v: string) => boolean; hint: string }> = {
  any: { test: () => true, hint: "" },
  email: { test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), hint: "Enter an email address like name@company.com" },
  number: { test: (v) => /^-?\d+(\.\d+)?$/.test(v), hint: "Enter a number" },
  phone: { test: (v) => /^\+?[\d\s().-]{6,}$/.test(v), hint: "Enter a phone number" },
  date: { test: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), hint: "Enter a date as YYYY-MM-DD" },
};

/** Validate a field's current text against its format. Empty is not an error
 *  here — "required" is a separate concern handled by the completion gate. */
export function fieldFormatError(f: EsignField): string | null {
  if (f.type !== "text") return null;
  const fmt = f.format ?? "any";
  if (fmt === "any") return null;
  const text = f.value?.type === "text" ? f.value.text.trim() : "";
  if (!text) return null;
  return FORMAT_RULE[fmt].test(text) ? null : FORMAT_RULE[fmt].hint;
}

export interface EsignSigner {
  id: string;
  name: string;
  email: string;
  role: string;
  /** 1-based position in the sequential order (ignored when order is parallel) */
  order: number;
  /** index into the signer palette (color coded fields), stable per signer */
  colorIndex: number;
  status: EsignSignerStatus;
  viewedAt?: string;
  signedAt?: string;
  /** a note included in this recipient's invitation, shown to them when signing */
  message?: string;
}

/** A copied-in recipient: receives the completed document, signs nothing. */
export interface EsignCcRecipient {
  id: string;
  name: string;
  email: string;
}

/** Delivery policy carried with the envelope and handed to the send seam. */
export interface EsignReminderPolicy {
  /** re-notify unsigned recipients every N days; 0 = no reminders */
  everyDays: number;
  /** envelope expires N days after sending; 0 = never */
  expiresInDays: number;
}

export const DEFAULT_REMINDER_POLICY: EsignReminderPolicy = { everyDays: 3, expiresInDays: 30 };

export interface EsignAuditEvent {
  id: string;
  at: string; // ISO
  type:
    | "created" | "document_loaded" | "field_added" | "field_removed"
    | "signer_added" | "signer_removed" | "sent" | "viewed" | "signed"
    | "declined" | "completed" | "template_applied" | "downloaded"
    | "document_edited" | "document_frozen" | "document_amended";
  actor: string; // signer name/email or "Owner"
  detail: string;
}

/** A reusable field layout: fields keyed to signer ROLES (not concrete signers). */
export interface EsignTemplate {
  id: string;
  name: string;
  createdAt: string;
  /** roles in signing order; applying maps role[i] -> envelope signer[i] */
  roles: string[];
  fields: Array<Omit<EsignField, "signerId" | "value"> & { roleIndex: number }>;
}

export interface EsignDocument {
  name: string;
  /** application/pdf or image/png|jpeg — images render as a single "page" */
  mime: string;
  /** the raw file, base64 (self-contained snapshot; no external fetch) */
  dataBase64: string;
  pageCount: number;
}

/** The EDITABLE source behind the signing base — a document-block snapshot
 *  (the Notion×Word surface from `blocks/document`). While the envelope is in
 *  DRAFTING, this is what the owner edits (with tracked changes, docx import/
 *  export); "freeze" renders it to the PDF signing base. A .docx never needs to
 *  round-trip outside the product: import → edit → freeze → place fields → send. */
export interface EsignSource {
  kind: "document";
  snapshot: import("../document/snapshot").DocumentSnapshot;
  /** set when the draft changed after the last freeze — the render is stale */
  dirtySinceFreeze?: boolean;
}

/** An OWNER amendment applied to an uploaded PDF before sending — a white-out
 *  (redaction-style cover) or a text correction drawn on top. Baked INTO the
 *  PDF bytes at send time (they become part of the immutable signing base) and
 *  honest about the boundary: this amends/annotates/covers; it does not reflow
 *  the PDF's own text — full reflow needs the source document (DRAFTING). */
export interface EsignAnnotation {
  id: string;
  kind: "whiteout" | "text";
  page: number;
  x: number; y: number; w: number; h: number; // fractions, same space as fields
  text?: string; // kind "text"
}

export interface EsignEnvelope {
  kind: "esign-envelope";
  v: 1;
  id: string;
  name: string;
  status: EsignEnvelopeStatus;
  signingOrder: EsignSigningOrder;
  document: EsignDocument | null;
  /** editable source document (drafting pane); null/absent = upload-only flow */
  source?: EsignSource | null;
  /** owner amendments on an uploaded PDF, pending until baked at send */
  annotations?: EsignAnnotation[];
  signers: EsignSigner[];
  /** copied-in recipients — receive the completed document, sign nothing */
  cc?: EsignCcRecipient[];
  /** reminder + expiry policy applied when the envelope is sent */
  reminders?: EsignReminderPolicy;
  fields: EsignField[];
  events: EsignAuditEvent[];
  templates: EsignTemplate[];
  sentAt?: string;
  completedAt?: string;
  /** completion certificate id (short hash over the terminal envelope state) */
  certificateId?: string;
}

/* -------------------------------------------------------------------- config */

/** Payload handed to the send seam — the exact shape a backend mailer needs.
 *  Without an `onSend` handler the surface performs a LABELED demo send (audit
 *  event only, clearly marked; no real delivery — see docs/RECIPES.md). */
export interface EsignSendRequest {
  envelopeId: string;
  documentName: string;
  signingOrder: EsignSigningOrder;
  recipients: Array<{
    signerId: string; name: string; email: string; role: string; order: number;
    fieldCount: number; requiredFieldCount: number;
    /** where the recipient signs; a real backend generates + mails this link */
    signingUrl: string;
    /** per-recipient note included in their invitation */
    message?: string;
  }>;
  /** copied-in recipients — send them the completed document, no signing link */
  cc: EsignCcRecipient[];
  /** reminder cadence + expiry the backend should enforce */
  reminders: EsignReminderPolicy;
  sentAt: string;
}

export interface ESignConfig {
  /** surface title; defaults to the envelope name */
  title?: string;
  /** restrict the palette; default = all six types */
  fieldTypes?: EsignFieldType[];
  /** default order for new envelopes */
  signingOrder?: EsignSigningOrder;
  /** CONFIG SEAM — real email/delivery backend. Absent => labeled demo send. */
  onSend?: (req: EsignSendRequest) => Promise<void> | void;
  /** signing-link template for the review surface, e.g. "https://app.example.com/sign/{envelopeId}/{signerId}" */
  signingUrlTemplate?: string;
  /** show the demo-state switcher (draft / partially signed / completed).
   *  Default true — it is how a visitor reaches the post-send states without
   *  being stranded in a locked envelope. Set false in a real deployment. */
  demoStates?: boolean;
}

/* -------------------------------------------------------------------- guards */

export function isEsignSnapshot(x: unknown): x is EsignEnvelope {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    e.kind === "esign-envelope" &&
    e.v === 1 &&
    typeof e.id === "string" &&
    Array.isArray(e.signers) &&
    Array.isArray(e.fields) &&
    Array.isArray(e.events)
  );
}

/* ------------------------------------------------------------------- helpers */

export const esignId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

const FIELD_DEFAULT_SIZE: Record<EsignFieldType, { w: number; h: number }> = {
  signature: { w: 0.28, h: 0.055 },
  initials: { w: 0.1, h: 0.045 },
  date: { w: 0.16, h: 0.032 },
  text: { w: 0.24, h: 0.032 },
  checkbox: { w: 0.035, h: 0.027 },
  dropdown: { w: 0.2, h: 0.032 },
};
export const fieldDefaultSize = (t: EsignFieldType) => FIELD_DEFAULT_SIZE[t];

export const FIELD_TYPE_LABEL: Record<EsignFieldType, string> = {
  signature: "Signature",
  initials: "Initials",
  date: "Date",
  text: "Text",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
};

/** Signer palette indexes — resolved to color via CSS (--nx-* derived classes). */
export const SIGNER_COLOR_COUNT = 6;

export function isFieldFilled(f: EsignField): boolean {
  const v = f.value;
  if (!v) return false;
  if (v.type === "checkbox") return true; // an explicit answer either way
  if (v.type === "signature" || v.type === "initials") return true;
  return v.text.trim().length > 0;
}

export function signerFields(env: EsignEnvelope, signerId: string): EsignField[] {
  return env.fields.filter((f) => f.signerId === signerId);
}

/** Whose turn is it: parallel => every non-signed signer; sequential => the first
 *  non-signed signer in order. */
export function activeSignerIds(env: EsignEnvelope): string[] {
  if (env.status !== "sent" && env.status !== "partially_signed") return [];
  const unsigned = [...env.signers].sort((a, b) => a.order - b.order).filter((s) => s.status !== "signed");
  if (unsigned.length === 0) return [];
  return env.signingOrder === "parallel" ? unsigned.map((s) => s.id) : [unsigned[0].id];
}

export function envelopeStatusAfterSign(env: EsignEnvelope): EsignEnvelopeStatus {
  const signed = env.signers.filter((s) => s.status === "signed").length;
  if (signed === env.signers.length && env.signers.length > 0) return "completed";
  return signed > 0 ? "partially_signed" : "sent";
}

/** SHA-256 over the envelope's terminal facts -> short certificate id. */
export async function computeCertificateId(env: EsignEnvelope): Promise<string> {
  const material = JSON.stringify({
    id: env.id,
    doc: env.document?.name,
    signers: env.signers.map((s) => [s.id, s.email, s.signedAt]),
    fields: env.fields.map((f) => [f.id, f.type, f.page, f.value ? 1 : 0]),
    completedAt: env.completedAt,
  });
  const data = new TextEncoder().encode(material);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest).slice(0, 10))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // non-secure-context fallback (clearly weaker; demo only)
  let h = 5381;
  for (const b of data) h = ((h << 5) + h + b) >>> 0;
  return `x${h.toString(16)}`;
}

export function appendEvent(
  env: EsignEnvelope,
  type: EsignAuditEvent["type"],
  actor: string,
  detail: string,
): EsignEnvelope {
  return {
    ...env,
    events: [...env.events, { id: esignId(), at: new Date().toISOString(), type, actor, detail }],
  };
}

/* ---------------------------------------------------------------------- seed */

import { SEED_CONTRACT_NAME, SEED_CONTRACT_PDF_BASE64 } from "./seed-pdf";

/** The demo states a seeded envelope can be opened in. `draft` is the default:
 *  a sent envelope correctly locks fields and signers, so seeding one leaves a
 *  first-time visitor staring at a greyed-out palette with nothing to do. */
export type EsignSeedState = "draft" | "sent" | "completed";

export const ESIGN_SEED_STATES: Array<{ id: EsignSeedState; label: string; short: string; hint: string }> = [
  { id: "draft", label: "Draft", short: "Draft", hint: "Editable — place fields, edit signers, send" },
  { id: "sent", label: "Partially signed", short: "Signing", hint: "Provider signed; the client's turn" },
  { id: "completed", label: "Completed", short: "Done", hint: "Both signed, certificate issued" },
];

/** seedEnvelope — the flagship demo AND deterministic journey fixture: a real
 *  2-page MSA (embedded PDF), two signers with color-coded fields on page 2
 *  (signature + date + initials each, one shared PO text field + a checkbox),
 *  plus a saved template.
 *
 *  DEFAULT = `draft`, so the surface is immediately workable: the field palette
 *  is live, fields drag, signers edit, and Send is available. Pass "sent" or
 *  "completed" for the downstream states (the surface's demo-state switcher and
 *  the journey use these). */
export function seedEnvelope(state: EsignSeedState = "draft"): EsignEnvelope {
  if (state === "sent") return seedSentEnvelope();
  if (state === "completed") return seedCompletedEnvelope();
  return seedDraftEnvelope();
}

/** The MSA as an editable document snapshot — the DRAFTING pane's seed content.
 *  Mirrors the embedded seed PDF, so "edit the contract" opens on the same text. */
export function seedContractSource(): EsignSource {
  const B = (i: number, type: "p" | "h1" | "h2" | "h3" | "quote", text: string) =>
    ({ id: `msa-b${i}`, type, text }) as import("../document/snapshot").DocumentSnapshot["blocks"][number];
  return {
    kind: "document",
    snapshot: {
      id: "doc-msa-2026-0142",
      title: "Master Services Agreement",
      pageWidth: "narrow",
      blocks: [
        B(1, "p", "Agreement No. MSA-2026-0142"),
        B(2, "p", "This Master Services Agreement (the “Agreement”) is entered into as of the Effective Date by and between **Meridian Analytics Ltd.**, a company registered in Ireland with offices at 4 Harbour Square, Dublin (“Provider”), and **Northwind Retail Group BV**, with offices at Keizersgracht 220, Amsterdam (“Client”)."),
        B(3, "h2", "1. Services"),
        B(4, "p", "Provider shall deliver the analytics platform implementation and managed reporting services described in Statement of Work #1, including data pipeline configuration, dashboard delivery, and quarterly business reviews."),
        B(5, "h2", "2. Term"),
        B(6, "p", "The initial term is twenty-four (24) months from the Effective Date, renewing automatically for successive twelve (12) month periods unless either party gives ninety (90) days written notice of non-renewal."),
        B(7, "h2", "3. Fees and Payment"),
        B(8, "p", "Client shall pay the fees set out in Exhibit B. Invoices are issued monthly in arrears and are payable within thirty (30) days. Late amounts accrue interest at 1% per month or the maximum permitted by law, whichever is lower."),
        B(9, "h2", "4. Confidentiality"),
        B(10, "p", "Each party shall protect the other party's Confidential Information with at least the same degree of care it uses for its own, and no less than reasonable care, and shall use it solely to perform under this Agreement."),
        B(11, "h2", "5. Data Protection"),
        B(12, "p", "The parties shall comply with the Data Processing Addendum in Exhibit C. Provider acts as processor for Client personal data and shall implement the technical and organisational measures described therein."),
        B(13, "h2", "6. Limitation of Liability"),
        B(14, "p", "Except for breaches of confidentiality or amounts owed, neither party's aggregate liability shall exceed the fees paid or payable in the twelve (12) months preceding the claim. Neither party is liable for indirect or consequential damages."),
        B(15, "h2", "7. Governing Law"),
        B(16, "p", "This Agreement is governed by the laws of Ireland. The courts of Dublin have exclusive jurisdiction, without regard to conflict of law principles."),
        B(17, "quote", "IN WITNESS WHEREOF, the parties have executed this Agreement by their duly authorised representatives as of the Effective Date."),
      ],
    },
  };
}

/** DRAFT — everything unlocked, nothing signed yet. */
export function seedDraftEnvelope(): EsignEnvelope {
  const base = seedSentEnvelope();
  const t0 = "2026-07-20T09:12:00.000Z";
  return {
    ...base,
    source: seedContractSource(),
    id: "env-msa-2026-0142-draft",
    status: "draft",
    sentAt: undefined,
    signers: base.signers.map((s) => ({
      ...s,
      status: "pending" as EsignSignerStatus,
      viewedAt: undefined,
      signedAt: undefined,
    })),
    // fields keep their placement but carry no values — the demo starts clean
    fields: base.fields.map(({ value, ...f }) => f),
    events: [
      { id: "ev1", at: t0, type: "created", actor: "Owner", detail: "Envelope created" },
      { id: "ev2", at: t0, type: "document_loaded", actor: "Owner", detail: SEED_CONTRACT_NAME + " (2 pages)" },
    ],
  };
}

/** COMPLETED — both parties signed, certificate issued. */
export function seedCompletedEnvelope(): EsignEnvelope {
  const base = seedSentEnvelope();
  const t4 = "2026-07-21T14:22:00.000Z";
  const t5 = "2026-07-21T14:26:00.000Z";
  const client = base.signers[1];
  return {
    ...base,
    id: "env-msa-2026-0142-done",
    status: "completed",
    completedAt: t5,
    certificateId: "9f2c41a7be05d3186c4a",
    signers: base.signers.map((s) =>
      s.id === client.id ? { ...s, status: "signed" as EsignSignerStatus, viewedAt: t4, signedAt: t5 } : s,
    ),
    fields: base.fields.map((f) =>
      f.signerId !== client.id || f.value
        ? f
        : f.type === "signature"
          ? { ...f, value: { type: "signature", signature: { kind: "drawn", dataUrl: CLIENT_SIGNATURE_PNG, at: t5 } } as EsignFieldValue }
          : f.type === "initials"
            ? { ...f, value: { type: "initials", signature: { kind: "typed", text: "JdV", font: "cursive-1", at: t5 } } as EsignFieldValue }
            : f.type === "date"
              ? { ...f, value: { type: "date", text: "2026-07-21" } as EsignFieldValue }
              : f.type === "checkbox"
                ? { ...f, value: { type: "checkbox", checked: true } as EsignFieldValue }
                : { ...f, value: { type: "text", text: "PO-88412" } as EsignFieldValue },
    ),
    events: [
      ...base.events,
      { id: "ev6", at: t4, type: "viewed", actor: "jonas.devries@northwind-retail.example", detail: "Opened the document" },
      { id: "ev7", at: t5, type: "signed", actor: "jonas.devries@northwind-retail.example", detail: "Signed 5 fields (drawn signature)" },
      { id: "ev8", at: t5, type: "completed", actor: "System", detail: "All recipients signed — certificate 9f2c41a7be05d3186c4a issued" },
    ],
  };
}

/** A small drawn-signature PNG so the completed demo shows real ink. */
const CLIENT_SIGNATURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAAAAXNSR0IArs4c6QAABGtJREFUeF7t3EFy2zAQBED7/4/2A1Kli2ITwOxeXTOAsD0EJTuf7/f7/eM/AgS+FfgIxJ0hwG8BgbgbBP4QEIjbg4BA3AME+gS8g/S5WVUiIJCSopvZJyAQd4RAn4BA+tysKhEQSEnRzewTEEifm1UlAgIpKbqZfQIC6XOzqkRAICVFN7NPQCB9blaVCAikpOhm9gkIpM/NqhIBgZQU3cw+AYH0uVlVIiCQkqKb2ScgkD43q0oEBFJSdDP7BATS52ZViYBASopuZp+AQPrcrCoREEhJ0c3sExBIn5tVJQICKSm6mX0CAulzs6pEQCAlRTezT0AgfW5WlQgIpKToZvYJCKTPzaoSAYGUFN3MPgGB9LlZVSIgkJKim9knIJA+N6tKBARSUnQz+wQE0udmVYmAQEqKbmafgED63KwqERBISdHN7BMQSJ+bVSUCAikpupl9AgLpc7OqREAgJUU3s09AIH1uVpUICKSk6Gb2CQikz82qEgGBlBTdzD4BgfS5WVUiIJCSopvZJyCQPjerSgQEUlJ0M/sEBNLnZlWJgEBKim5mn4BA+tysKhEQSEnRzewTEEifm1UlAgIpKbqZfQIC6XOzqkRAICVFN7NPQCB9blaVCAikpOhm9gkIpM/NqhIBgZQU3cw+AYH0uVlVIiCQkqKb2ScgkD43q0oEBFJSdDP7BATS52ZViYBASopuZp+AQPrcrCoREEhJ0c3sExBIn5tVJQICKSm6mX0CAulzs6pEQCAlRTezT0AgfW5WlQgIpKToZvYJCKTPzaoSAYGUFN3MPgGB9LlZVSIgkJKim9knIJA+N6tKBARSUnQz+wQE0udmVYmAQEqKbmafgED63KwqERBISdHN7BMQSJ+bVSUCAikpupl9AgLpc7OqREAgJUU3s09AIH1uVpUICKSk6Gb2CQikz82qEgGBlBTdzD4BgfS5WVUiIJCSopvZJyCQPjerSgQEUlJ0M/sEBNLnZlWJgEBKim5mn4BA+tysKhEQSEnRzewTEEifm1UlAgIpKbqZfQIC6XOzqkRAICVFN7NPQCB9blaVCAikpOhm9gkIpM/NqhIBgZQU3cw+AYH0uVlVIiCQkqKb2ScgkD43q0oEBFJSdDP7BATS52ZViYBASopuZp+AQPrcrCoREEhJ0c3sExBIn5tVJQICKSm6mX0CAulzs6pEQCAlRTezT0AgfW5WlQgIpKToZvYJCKTPzaoSAYGUFN3MPgGB9LlZVSIgkJKim9knIJA+N6tKBARSUnQz+wQE0udmVYmAQEqKbmafgED63KwqERBISdHN7BMQSJ+bVSUCAikpupl9AgLpc7OqREAgJUU3s09AIH1uVpUICKSk6Gb2CQikz82qEgGBlBTdzD4BgfS5WVUiIJCSopvZJyCQPjerSgQEUlJ0M/sEBNLnZlWJgEBKim5mn4BA+tysKhEQSEnRzewTEEifm1UlAgIpKbqZfQIC6XOzqkRAICVFN7NPQCB9blaVCAikpOhm9gkIpM/NqhIBgZQU3cw+AYH0uVlVIvALTd0Cbcm3sJoAAAAASUVORK5CYII=";

/** SENT / partially signed — the Provider has signed, the Client's turn. */
export function seedSentEnvelope(): EsignEnvelope {
  const t0 = "2026-07-20T09:12:00.000Z";
  const t1 = "2026-07-20T09:31:00.000Z";
  const t2 = "2026-07-21T08:05:00.000Z";
  const t3 = "2026-07-21T08:09:00.000Z";
  const provider: EsignSigner = {
    id: "signer-provider", name: "Elena Vasquez", email: "elena.vasquez@meridian-analytics.example",
    role: "Provider", order: 1, colorIndex: 0, status: "signed", viewedAt: t2, signedAt: t3,
  };
  const client: EsignSigner = {
    id: "signer-client", name: "Jonas de Vries", email: "jonas.devries@northwind-retail.example",
    role: "Client", order: 2, colorIndex: 1, status: "pending",
  };
  const sigAt = t3;
  // page-2 geometry mirrors the printed signature wells (612x792pt page):
  // provider well at x=64, client well at x=348; line y=300pt from bottom.
  const px = (x: number) => x / 612;
  const py = (yTop: number) => yTop / 792; // yTop measured from page TOP
  const fields: EsignField[] = [
    { id: "f-prov-sig", type: "signature", page: 1, x: px(64), y: py(792 - 300 - 44), w: px(200), h: py(44), signerId: provider.id, required: true, label: "Provider signature",
      value: { type: "signature", signature: { kind: "typed", text: "Elena Vasquez", font: "cursive-1", at: sigAt } } },
    { id: "f-prov-date", type: "date", page: 1, x: px(98), y: py(792 - 214 - 20), w: px(126), h: py(20), signerId: provider.id, required: true, label: "Date signed",
      value: { type: "date", text: "2026-07-21" } },
    { id: "f-prov-init", type: "initials", page: 1, x: px(106), y: py(792 - 184 - 20), w: px(58), h: py(20), signerId: provider.id, required: true, label: "Initials",
      value: { type: "initials", signature: { kind: "typed", text: "EV", font: "cursive-1", at: sigAt } } },
    { id: "f-cli-sig", type: "signature", page: 1, x: px(348), y: py(792 - 300 - 44), w: px(200), h: py(44), signerId: client.id, required: true, label: "Client signature" },
    { id: "f-cli-date", type: "date", page: 1, x: px(382), y: py(792 - 214 - 20), w: px(126), h: py(20), signerId: client.id, required: true, label: "Date signed" },
    { id: "f-cli-init", type: "initials", page: 1, x: px(390), y: py(792 - 184 - 20), w: px(58), h: py(20), signerId: client.id, required: true, label: "Initials" },
    { id: "f-cli-po", type: "text", page: 1, x: px(234), y: py(792 - 138 - 20), w: px(210), h: py(20), signerId: client.id, required: false, label: "PO reference" },
    { id: "f-cli-dpa", type: "checkbox", page: 0, x: px(64), y: py(792 - 190), w: 0.03, h: 0.023, signerId: client.id, required: true, label: "I accept the DPA in Exhibit C" },
  ];
  const env: EsignEnvelope = {
    kind: "esign-envelope",
    v: 1,
    id: "env-msa-2026-0142",
    name: "MSA — Meridian x Northwind",
    status: "partially_signed",
    signingOrder: "sequential",
    document: {
      name: SEED_CONTRACT_NAME,
      mime: "application/pdf",
      dataBase64: SEED_CONTRACT_PDF_BASE64,
      pageCount: 2,
    },
    signers: [provider, client],
    fields,
    events: [
      { id: "ev1", at: t0, type: "created", actor: "Owner", detail: "Envelope created" },
      { id: "ev2", at: t0, type: "document_loaded", actor: "Owner", detail: SEED_CONTRACT_NAME + " (2 pages)" },
      { id: "ev3", at: t1, type: "sent", actor: "Owner", detail: "Sent to 2 recipients (sequential) — demo send, no email delivered" },
      { id: "ev4", at: t2, type: "viewed", actor: "elena.vasquez@meridian-analytics.example", detail: "Opened the document" },
      { id: "ev5", at: t3, type: "signed", actor: "elena.vasquez@meridian-analytics.example", detail: "Signed 3 fields (typed signature)" },
    ],
    templates: [
      {
        id: "tpl-msa-2party",
        name: "Two-party MSA layout",
        createdAt: t0,
        roles: ["Provider", "Client"],
        fields: fields.map(({ signerId, value, ...rest }) => ({
          ...rest,
          roleIndex: signerId === provider.id ? 0 : 1,
        })),
      },
    ],
    sentAt: t1,
  };
  return env;
}
