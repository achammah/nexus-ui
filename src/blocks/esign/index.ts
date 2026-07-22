import * as React from "react";

/* E-signature block — a DocuSeal-class signing surface (document intake, field
   placement, ordered signers, review-gated send, signing with drawn/typed/
   uploaded signatures, audit trail + completion certificate, templates).
   The pdf engines (pdfjs-dist render, pdf-lib flatten) ship ONLY behind the
   lazy surface chunk; these eager exports are dependency-free and node-testable. */

export {
  ESIGN_STORE_PREFIX,
  esignStoreKey,
  isEsignSnapshot,
  seedEnvelope,
  seedDraftEnvelope,
  seedSentEnvelope,
  seedCompletedEnvelope,
  ESIGN_SEED_STATES,
  type EsignSeedState,
  esignId,
  fieldDefaultSize,
  isFieldFilled,
  signerFields,
  activeSignerIds,
  envelopeStatusAfterSign,
  computeCertificateId,
  appendEvent,
  FIELD_TYPE_LABEL,
  SIGNER_COLOR_COUNT,
  type EsignEnvelope,
  type EsignEnvelopeStatus,
  type EsignDocument,
  type EsignField,
  type EsignFieldType,
  type EsignFieldValue,
  type EsignSignatureValue,
  type EsignSigner,
  type EsignSignerStatus,
  type EsignSigningOrder,
  type EsignAuditEvent,
  type EsignTemplate,
  type EsignSendRequest,
  type ESignConfig,
} from "./snapshot";

export type { ESignSurfaceProps } from "./ESignSurface";

/* the lazy surface — host renders it under a Suspense fallback (mirrors
   LazyWorkbookSurface; an eager re-export would pull the pdf engines into the
   eager bundle) */
export const LazyESignSurface = React.lazy(() => import("./ESignSurface"));
