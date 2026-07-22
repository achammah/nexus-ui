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
  value?: EsignFieldValue;
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
}

export interface EsignAuditEvent {
  id: string;
  at: string; // ISO
  type:
    | "created" | "document_loaded" | "field_added" | "field_removed"
    | "signer_added" | "signer_removed" | "sent" | "viewed" | "signed"
    | "declined" | "completed" | "template_applied" | "downloaded";
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

export interface EsignEnvelope {
  kind: "esign-envelope";
  v: 1;
  id: string;
  name: string;
  status: EsignEnvelopeStatus;
  signingOrder: EsignSigningOrder;
  document: EsignDocument | null;
  signers: EsignSigner[];
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
  }>;
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

/** seedEnvelope — the flagship demo AND deterministic journey fixture: a real
 *  2-page MSA (embedded PDF), two signers with color-coded fields on page 2
 *  (signature + date + initials each, one shared PO text field + a checkbox),
 *  SENT state with the Provider signer ALREADY SIGNED (typed signature), so the
 *  partially-signed status, the audit trail, and "whose turn" all show on load. */
export function seedEnvelope(): EsignEnvelope {
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
