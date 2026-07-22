// ESignSurface — a DocuSeal-class e-signature surface (reference product:
// docusealco/docuseal): document intake -> field placement -> signers -> send
// (review-gated) -> signing -> audit trail + completion certificate + flatten.
// Free-surface contract (mirrors WorkbookSurface): host owns the snapshot via
// value/onChange/reloadNonce; this component owns the flow. All chrome rides
// --nx-* tokens (esign.css); pdf engines load lazily (pdf.ts).
import * as React from "react";
import "./esign.css";
import {
  activeSignerIds, appendEvent, computeCertificateId, envelopeStatusAfterSign,
  esignId, fieldDefaultSize, FIELD_TYPE_LABEL, isEsignSnapshot, isFieldFilled,
  seedEnvelope, SIGNER_COLOR_COUNT, ESIGN_SEED_STATES,
  type ESignConfig, type EsignEnvelope, type EsignField, type EsignFieldType,
  type EsignFieldValue, type EsignSeedState, type EsignSendRequest, type EsignSigner,
} from "./snapshot";
import { downloadBytes, fileToEsignDocument, flattenEnvelope, openDocument, type PdfDocHandle, type PdfPageHandle } from "./pdf";
import { initialsOf, SignatureDialog, signatureFontCss } from "./SignatureDialog";

export interface ESignSurfaceProps {
  /** the envelope to load; null seeds the demo envelope */
  value: EsignEnvelope | null;
  /** fired on every persisted change — the host debounces */
  onChange?: (snapshot: EsignEnvelope) => void;
  /** bump to force a fresh mount from the current `value` */
  reloadNonce?: number;
  config?: ESignConfig;
  className?: string;
  /** host controls (save state, reset) — rendered into the header's right end */
  actions?: React.ReactNode;
  "data-testid"?: string;
}

type Tab = "prepare" | "sign" | "audit";

/** which demo state the current envelope reads as (the switcher's active seg) */
function envMatchesSeed(env: EsignEnvelope, state: EsignSeedState): boolean {
  if (state === "draft") return env.status === "draft";
  if (state === "completed") return env.status === "completed";
  return env.status === "sent" || env.status === "partially_signed";
}

/* the manual zoom range and the fit-width floor are the SAME range, so fitting a
   narrow pane can never park the control at a disabled bound with a clipped page */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;
const ALL_FIELD_TYPES: EsignFieldType[] = ["signature", "initials", "date", "text", "checkbox", "dropdown"];
const STATUS_LABEL: Record<EsignEnvelope["status"], string> = {
  draft: "Draft", sent: "Sent", partially_signed: "Partially signed", completed: "Completed",
};

/* ------------------------------------------------------------------ surface */

export default function ESignSurface({
  value, onChange, reloadNonce = 0, config, className, actions, ...rest
}: ESignSurfaceProps) {
  const [env, setEnv] = React.useState<EsignEnvelope>(() =>
    value && isEsignSnapshot(value) ? value : seedEnvelope(),
  );
  // remount from value on reload
  React.useEffect(() => {
    setEnv(value && isEsignSnapshot(value) ? value : seedEnvelope());
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadNonce]);

  const envRef = React.useRef(env);
  envRef.current = env;
  const commit = React.useCallback((next: EsignEnvelope | ((cur: EsignEnvelope) => EsignEnvelope)) => {
    setEnv((cur) => {
      const resolved = typeof next === "function" ? next(cur) : next;
      onChangeRef.current?.(resolved);
      return resolved;
    });
  }, []);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const [tab, setTab] = React.useState<Tab>(env.status === "draft" ? "prepare" : "sign");
  const [zoom, setZoom] = React.useState(1);
  /* once the user works the zoom control we stop auto-fitting under them */
  const zoomTouched = React.useRef(false);
  const setZoomManual = React.useCallback((next: React.SetStateAction<number>) => {
    zoomTouched.current = true;
    setZoom(next);
  }, []);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [armedType, setArmedType] = React.useState<EsignFieldType | null>(null);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [tplOpen, setTplOpen] = React.useState(false);
  const [signingAs, setSigningAs] = React.useState<string | null>(null);
  const [sigDialog, setSigDialog] = React.useState<{ fieldId: string; kind: "signature" | "initials" } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [docError, setDocError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  /* ---- document open + page handles */
  const [pages, setPages] = React.useState<PdfPageHandle[]>([]);
  const docKey = env.document ? `${env.document.name}:${env.document.dataBase64.length}` : "none";
  React.useEffect(() => {
    let dead = false;
    let handle: PdfDocHandle | null = null;
    setPages([]);
    setDocError(null);
    if (!env.document) return;
    (async () => {
      try {
        handle = await openDocument(env.document!);
        const ps: PdfPageHandle[] = [];
        for (let i = 0; i < handle.pageCount; i++) ps.push(await handle.getPage(i));
        if (!dead) setPages(ps);
      } catch (err) {
        if (!dead) setDocError(err instanceof Error ? err.message : "Could not open the document.");
      }
    })();
    return () => { dead = true; handle?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, reloadNonce]);

  // fit-width: a phone (or narrow pane) gets the whole page width on screen
  // instead of a clipped 100% render. This re-runs on CONTAINER RESIZE (rotate,
  // pane drag, responsive reflow) — fitting only at load time leaves a stale
  // desktop zoom behind and the page clips. The user's own zoom wins from the
  // moment they touch the control.
  React.useEffect(() => {
    const first = pages[0];
    const box = scrollRef.current;
    if (!first || !box) return;
    const fit = () => {
      if (zoomTouched.current) return;
      // slack covers the page gutter plus the page's own border/shadow, so the
      // fit result never lands one pixel wide and clips
      const avail = box.clientWidth - 40;
      const next = first.width > avail
        ? Math.max(ZOOM_MIN, Math.floor((avail / first.width) * 100) / 100)
        : 1;
      setZoom((z) => (z === next ? z : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [pages]);

  const editable = env.status === "draft";
  const fieldTypes = config?.fieldTypes ?? ALL_FIELD_TYPES;
  const showDemoStates = config?.demoStates ?? true;

  /** Swap the whole envelope for a seeded demo state. A sent envelope locks
   *  fields and signers by design, so the surface must always offer a way back
   *  to an editable one. */
  const loadSeedState = (state: EsignSeedState) => {
    const next = seedEnvelope(state);
    setEnv(next);
    setSelectedId(null);
    setSigningAs(null);
    setTab(next.status === "draft" ? "prepare" : next.status === "completed" ? "audit" : "sign");
    onChangeRef.current?.(next);
  };
  const activeIds = activeSignerIds(env);
  const signer = env.signers.find((s) => s.id === signingAs) ?? null;
  const selected = env.fields.find((f) => f.id === selectedId) ?? null;

  /* ---- intake */
  const loadFile = async (file: File) => {
    try {
      const doc = await fileToEsignDocument(file);
      // a new base document starts a fresh signing round: statuses, values and
      // completion facts reset; layout (fields on surviving pages) is kept
      commit((cur) => appendEvent(
        {
          ...cur, document: doc, status: "draft",
          fields: cur.fields.filter((f) => f.page < doc.pageCount).map(({ value, ...f }) => f),
          signers: cur.signers.map((s) => ({ ...s, status: "pending" as const, viewedAt: undefined, signedAt: undefined })),
          sentAt: undefined, completedAt: undefined, certificateId: undefined,
        },
        "document_loaded", "Owner", `${doc.name} (${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"})`,
      ));
      setPageIndex(0);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Could not open the file.");
    }
  };

  /* ---- field placement */
  const placeField = (type: EsignFieldType, page: number, fx: number, fy: number) => {
    const size = fieldDefaultSize(type);
    const firstSigner = env.signers[0];
    if (!firstSigner) { setNotice("Add a signer first — every field belongs to a signer."); return; }
    const f: EsignField = {
      id: esignId(), type, page,
      x: clamp(fx - size.w / 2, 0, 1 - size.w), y: clamp(fy - size.h / 2, 0, 1 - size.h),
      w: size.w, h: size.h,
      signerId: selected?.signerId ?? firstSigner.id,
      required: type !== "checkbox" && type !== "text",
      ...(type === "dropdown" ? { options: ["Option A", "Option B"] } : null),
    };
    commit((cur) => appendEvent({ ...cur, fields: [...cur.fields, f] }, "field_added", "Owner", `${FIELD_TYPE_LABEL[type]} on page ${page + 1}`));
    setSelectedId(f.id);
    setArmedType(null);
  };

  const patchField = (id: string, patch: Partial<EsignField>) =>
    commit((cur) => ({ ...cur, fields: cur.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  const removeField = (id: string) => {
    const f = env.fields.find((x) => x.id === id);
    commit((cur) => appendEvent(
      { ...cur, fields: cur.fields.filter((x) => x.id !== id) },
      "field_removed", "Owner", f ? `${FIELD_TYPE_LABEL[f.type]} removed from page ${f.page + 1}` : "Field removed",
    ));
    if (selectedId === id) setSelectedId(null);
  };

  /* keyboard: delete + nudge on the selected field */
  const onSurfaceKeyDown = (e: React.KeyboardEvent) => {
    if (!editable || !selected) return;
    const target = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeField(selected.id); }
    const step = e.shiftKey ? 0.02 : 0.004;
    if (e.key === "ArrowLeft") { e.preventDefault(); patchField(selected.id, { x: clamp(selected.x - step, 0, 1 - selected.w) }); }
    if (e.key === "ArrowRight") { e.preventDefault(); patchField(selected.id, { x: clamp(selected.x + step, 0, 1 - selected.w) }); }
    if (e.key === "ArrowUp") { e.preventDefault(); patchField(selected.id, { y: clamp(selected.y - step, 0, 1 - selected.h) }); }
    if (e.key === "ArrowDown") { e.preventDefault(); patchField(selected.id, { y: clamp(selected.y + step, 0, 1 - selected.h) }); }
  };

  /* ---- signers */
  const addSigner = () => {
    const n = env.signers.length;
    const s: EsignSigner = {
      id: esignId(), name: "", email: "", role: `Signer ${n + 1}`,
      order: n + 1, colorIndex: n % SIGNER_COLOR_COUNT, status: "pending",
    };
    commit((cur) => appendEvent({ ...cur, signers: [...cur.signers, s] }, "signer_added", "Owner", s.role));
  };
  const patchSigner = (id: string, patch: Partial<EsignSigner>) =>
    commit((cur) => ({ ...cur, signers: cur.signers.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeSigner = (id: string) => {
    const s = env.signers.find((x) => x.id === id);
    commit((cur) => appendEvent({
      ...cur,
      signers: cur.signers.filter((x) => x.id !== id).map((x, i) => ({ ...x, order: i + 1 })),
      fields: cur.fields.filter((f) => f.signerId !== id),
    }, "signer_removed", "Owner", s?.name || s?.role || "Signer"));
  };
  const moveSigner = (id: string, dir: -1 | 1) => {
    commit((cur) => {
      const ordered = [...cur.signers].sort((a, b) => a.order - b.order);
      const i = ordered.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ordered.length) return cur;
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      return { ...cur, signers: ordered.map((s, k) => ({ ...s, order: k + 1 })) };
    });
  };

  /* ---- send (review-gated; seam or labeled demo) */
  const sendProblems: string[] = [];
  if (!env.document) sendProblems.push("No document loaded.");
  if (env.signers.length === 0) sendProblems.push("No signers.");
  env.signers.forEach((s) => {
    if (!s.name.trim() || !s.email.trim()) sendProblems.push(`${s.role || "A signer"} is missing a name or email.`);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) sendProblems.push(`${s.name}: "${s.email}" is not a valid email.`);
    if (!env.fields.some((f) => f.signerId === s.id)) sendProblems.push(`${s.name || s.role} has no fields assigned.`);
  });

  const buildSendRequest = (): EsignSendRequest => ({
    envelopeId: env.id,
    documentName: env.document?.name ?? "",
    signingOrder: env.signingOrder,
    recipients: [...env.signers].sort((a, b) => a.order - b.order).map((s) => ({
      signerId: s.id, name: s.name, email: s.email, role: s.role, order: s.order,
      fieldCount: env.fields.filter((f) => f.signerId === s.id).length,
      requiredFieldCount: env.fields.filter((f) => f.signerId === s.id && f.required).length,
      signingUrl: (config?.signingUrlTemplate ?? "demo://sign/{envelopeId}/{signerId}")
        .replace("{envelopeId}", env.id).replace("{signerId}", s.id),
    })),
    sentAt: new Date().toISOString(),
  });

  const confirmSend = async () => {
    const req = buildSendRequest();
    let detail: string;
    if (config?.onSend) {
      try {
        await config.onSend(req);
        detail = `Sent to ${req.recipients.length} recipient${req.recipients.length === 1 ? "" : "s"} (${env.signingOrder}) via configured delivery`;
      } catch (err) {
        setNotice(`Delivery failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else {
      detail = `Sent to ${req.recipients.length} recipient${req.recipients.length === 1 ? "" : "s"} (${env.signingOrder}) — demo send, no email delivered`;
    }
    commit((cur) => appendEvent({ ...cur, status: "sent", sentAt: req.sentAt }, "sent", "Owner", detail));
    setSendOpen(false);
    setTab("sign");
    setSigningAs(null);
    if (!config?.onSend) setNotice("Demo send: recipients were NOT emailed. Wire ESignConfig.onSend for real delivery (docs/RECIPES.md).");
  };

  /* ---- signing */
  const startSigning = (id: string) => {
    setSigningAs(id);
    const s = env.signers.find((x) => x.id === id);
    if (s && !s.viewedAt) {
      commit((cur) => appendEvent({
        ...cur,
        signers: cur.signers.map((x) => (x.id === id ? { ...x, status: x.status === "pending" ? "viewed" : x.status, viewedAt: new Date().toISOString() } : x)),
      }, "viewed", s.email || s.name, "Opened the document"));
    }
    const first = env.fields.filter((f) => f.signerId === id).sort((a, b) => a.page - b.page || a.y - b.y)[0];
    if (first) setPageIndex(first.page);
  };

  const fillField = (fieldId: string, value: EsignFieldValue | undefined) =>
    commit((cur) => ({ ...cur, fields: cur.fields.map((f) => (f.id === fieldId ? { ...f, value } : f)) }));

  const myFields = signer ? env.fields.filter((f) => f.signerId === signer.id) : [];
  const missingRequired = myFields.filter((f) => f.required && !isFieldFilled(f));

  const finishSigning = async () => {
    if (!signer || missingRequired.length > 0) return;
    const now = new Date().toISOString();
    let next: EsignEnvelope = {
      ...envRef.current,
      signers: envRef.current.signers.map((s) => (s.id === signer.id ? { ...s, status: "signed" as const, signedAt: now } : s)),
    };
    next = appendEvent(next, "signed", signer.email || signer.name, `Signed ${myFields.filter(isFieldFilled).length} fields`);
    const status = envelopeStatusAfterSign(next);
    next = { ...next, status };
    if (status === "completed") {
      next = { ...next, completedAt: now };
      next = { ...next, certificateId: await computeCertificateId(next) };
      next = appendEvent(next, "completed", "System", `All ${next.signers.length} signers completed · certificate ${next.certificateId}`);
    }
    commit(next);
    setSigningAs(null);
    if (status === "completed") setTab("audit");
  };

  const downloadCompleted = async () => {
    try {
      const bytes = await flattenEnvelope(envRef.current);
      downloadBytes(bytes, envRef.current.name.replace(/[^\w\- ]+/g, "") + " — completed.pdf");
      commit((cur) => appendEvent(cur, "downloaded", "Owner", "Completed PDF downloaded (fields flattened + certificate page)"));
    } catch (err) {
      setNotice(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /* ---- templates */
  const [tplName, setTplName] = React.useState("");
  const saveTemplate = () => {
    const name = tplName.trim();
    if (!name || env.fields.length === 0) return;
    const roleOrder = [...env.signers].sort((a, b) => a.order - b.order);
    commit((cur) => ({
      ...cur,
      templates: [...cur.templates, {
        id: esignId(), name, createdAt: new Date().toISOString(),
        roles: roleOrder.map((s) => s.role || s.name),
        fields: cur.fields.map(({ signerId, value, ...restF }) => ({
          ...restF, roleIndex: Math.max(0, roleOrder.findIndex((s) => s.id === signerId)),
        })),
      }],
    }));
    setTplName("");
    setNotice(`Template "${name}" saved.`);
  };
  const applyTemplate = (tplId: string) => {
    const tpl = env.templates.find((t) => t.id === tplId);
    if (!tpl || !env.document) return;
    const ordered = [...env.signers].sort((a, b) => a.order - b.order);
    if (ordered.length < tpl.roles.length) {
      setNotice(`Template needs ${tpl.roles.length} signers (${tpl.roles.join(", ")}); the envelope has ${ordered.length}. Add signers first.`);
      return;
    }
    const pageCount = env.document.pageCount;
    commit((cur) => appendEvent({
      ...cur,
      fields: tpl.fields.filter((f) => f.page < pageCount).map((f) => ({
        ...f, id: esignId(), signerId: ordered[Math.min(f.roleIndex, ordered.length - 1)].id,
      })),
    }, "template_applied", "Owner", `"${tpl.name}" (${tpl.fields.length} fields)`));
    setTplOpen(false);
  };

  /* ------------------------------------------------------------- rendering */
  const title = config?.title ?? env.name;
  return (
    <div
      className={"nxEsign" + (className ? ` ${className}` : "")}
      onKeyDown={onSurfaceKeyDown}
      {...rest}
    >
      <header className="nxEsHeader">
        <div className="nxEsHeadLeft">
          <input
            className="nxEsTitleInput" value={title} aria-label="Envelope name"
            readOnly={!editable}
            onChange={(e) => commit((cur) => ({ ...cur, name: e.target.value }))}
          />
          <span className={`nxEsStatus is-${env.status}`} data-testid="esign-status">{STATUS_LABEL[env.status]}</span>
        </div>
        <nav className="nxEsTabsNav" role="tablist" aria-label="E-signature stages">
          {(["prepare", "sign", "audit"] as Tab[]).map((t) => (
            <button
              key={t} type="button" role="tab" aria-selected={tab === t}
              className={tab === t ? "nxEsTabBtn isActive" : "nxEsTabBtn"}
              onClick={() => setTab(t)}
              data-testid={`esign-tab-${t}`}
            >
              {t === "prepare" ? "Prepare" : t === "sign" ? "Sign" : "Activity"}
            </button>
          ))}
        </nav>
        <div className="nxEsHeadRight">
          {tab === "prepare" && editable && (
            <button
              type="button" className="nxEsBtn isPrimary" data-testid="esign-send"
              disabled={sendProblems.length > 0}
              title={sendProblems[0]}
              onClick={() => setSendOpen(true)}
            >
              Send for signature
            </button>
          )}
          {env.status === "completed" && (
            <button type="button" className="nxEsBtn isPrimary" onClick={downloadCompleted} data-testid="esign-download">
              Download signed PDF
            </button>
          )}
          {showDemoStates && (
            <div className="nxEsDemoStates" role="group" aria-label="Demo state">
              <span className="nxEsDemoLabel">Demo</span>
              {ESIGN_SEED_STATES.map((s) => (
                <button
                  key={s.id} type="button" title={s.hint}
                  className={"nxEsSegBtn" + (envMatchesSeed(env, s.id) ? " isActive" : "")}
                  aria-pressed={envMatchesSeed(env, s.id)}
                  onClick={() => loadSeedState(s.id)}
                  data-testid={`esign-demo-${s.id}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {actions}
        </div>
      </header>

      {notice && (
        <div className="nxEsNotice" role="status">
          <span>{notice}</span>
          <button type="button" className="nxEsIconBtn" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}
      {!editable && tab === "prepare" && (
        <div className="nxEsNotice isInfo" role="status">
          <span>
            This envelope was sent — fields and signers are locked, the way a real envelope
            behaves once recipients hold it. The Activity tab has the audit trail.
          </span>
          <button
            type="button" className="nxEsBtn isSm" data-testid="esign-back-to-draft"
            onClick={() => loadSeedState("draft")}
          >
            Start a new draft
          </button>
        </div>
      )}

      <div className={`nxEsBody mode-${tab}`}>
        {/* left rail: palette (prepare) or signer picker (sign) */}
        {tab === "prepare" && (
          <aside className="nxEsRail" aria-label="Field palette and signers">
            <section className="nxEsRailSec">
              <h3 className="nxEsRailTitle">Document</h3>
              {env.document ? (
                <div className="nxEsDocCard">
                  <div className="nxEsDocName" title={env.document.name}>{env.document.name}</div>
                  <div className="nxEsDocMeta">{env.document.pageCount} page{env.document.pageCount === 1 ? "" : "s"} · {Math.round(env.document.dataBase64.length * 0.75 / 1024)} KB</div>
                  {editable && (
                    <button type="button" className="nxEsBtn" onClick={() => fileRef.current?.click()}>Replace…</button>
                  )}
                </div>
              ) : (
                <button type="button" className="nxEsDropZone" onClick={() => fileRef.current?.click()}>
                  Load a PDF or image…
                </button>
              )}
              <input
                ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }}
              />
            </section>

            <section className="nxEsRailSec">
              <h3 className="nxEsRailTitle">Fields</h3>
              <p className="nxEsHint">Drag onto the page, or click then tap the page.</p>
              <div className="nxEsPalette" role="listbox" aria-label="Field types">
                {fieldTypes.map((t) => (
                  <button
                    key={t} type="button"
                    className={armedType === t ? "nxEsPaletteItem isArmed" : "nxEsPaletteItem"}
                    draggable={editable}
                    aria-pressed={armedType === t}
                    data-testid={`esign-palette-${t}`}
                    disabled={!editable || !env.document}
                    onClick={() => setArmedType((cur) => (cur === t ? null : t))}
                    onDragStart={(e) => e.dataTransfer.setData("application/x-esign-field", t)}
                  >
                    <FieldGlyph type={t} /> {FIELD_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </section>

            <section className="nxEsRailSec">
              <div className="nxEsRailTitleRow">
                <h3 className="nxEsRailTitle">Signers</h3>
                <div className="nxEsOrderToggle" role="radiogroup" aria-label="Signing order">
                  {(["sequential", "parallel"] as const).map((o) => (
                    <button
                      key={o} type="button" role="radio" aria-checked={env.signingOrder === o}
                      className={env.signingOrder === o ? "nxEsMiniTab isActive" : "nxEsMiniTab"}
                      disabled={!editable}
                      onClick={() => commit((cur) => ({ ...cur, signingOrder: o }))}
                    >
                      {o === "sequential" ? "In order" : "Any order"}
                    </button>
                  ))}
                </div>
              </div>
              <ol className="nxEsSignerList">
                {[...env.signers].sort((a, b) => a.order - b.order).map((s, i, arr) => (
                  <li key={s.id} className={`nxEsSignerCard sc-${s.colorIndex}`}>
                    <div className="nxEsSignerTop">
                      <span className="nxEsSignerDot" aria-hidden />
                      <span className="nxEsSignerOrder">{env.signingOrder === "sequential" ? `${s.order}.` : "•"}</span>
                      <input
                        className="nxEsInlineInput" placeholder="Full name" value={s.name} readOnly={!editable}
                        aria-label={`Signer ${s.order} name`}
                        onChange={(e) => patchSigner(s.id, { name: e.target.value })}
                      />
                      {editable && (
                        <span className="nxEsSignerBtns">
                          <button type="button" className="nxEsIconBtn" aria-label="Move up" disabled={i === 0} onClick={() => moveSigner(s.id, -1)}>↑</button>
                          <button type="button" className="nxEsIconBtn" aria-label="Move down" disabled={i === arr.length - 1} onClick={() => moveSigner(s.id, 1)}>↓</button>
                          <button type="button" className="nxEsIconBtn" aria-label={`Remove ${s.name || s.role}`} onClick={() => removeSigner(s.id)}>×</button>
                        </span>
                      )}
                    </div>
                    <input
                      className="nxEsInlineInput isSub" placeholder="email@company.com" value={s.email} readOnly={!editable}
                      aria-label={`Signer ${s.order} email`} type="email"
                      onChange={(e) => patchSigner(s.id, { email: e.target.value })}
                    />
                    <div className="nxEsSignerFoot">
                      <input
                        className="nxEsInlineInput isRole" placeholder="Role" value={s.role} readOnly={!editable}
                        aria-label={`Signer ${s.order} role`}
                        onChange={(e) => patchSigner(s.id, { role: e.target.value })}
                      />
                      <span className="nxEsSignerCount">{env.fields.filter((f) => f.signerId === s.id).length} fields</span>
                    </div>
                  </li>
                ))}
              </ol>
              {editable && (
                <button type="button" className="nxEsBtn isBlock" onClick={addSigner} data-testid="esign-add-signer">+ Add signer</button>
              )}
            </section>

            <section className="nxEsRailSec">
              <h3 className="nxEsRailTitle">Templates</h3>
              {env.templates.length > 0 && (
                <button type="button" className="nxEsBtn isBlock" onClick={() => setTplOpen(true)}>
                  Apply a template ({env.templates.length})
                </button>
              )}
              {editable && env.fields.length > 0 && (
                <div className="nxEsTplSave">
                  <input
                    className="nxEsInput" placeholder="Template name" value={tplName}
                    aria-label="Template name"
                    onChange={(e) => setTplName(e.target.value)}
                  />
                  <button type="button" className="nxEsBtn" disabled={!tplName.trim()} onClick={saveTemplate}>Save layout</button>
                </div>
              )}
            </section>
          </aside>
        )}

        {tab === "sign" && (
          <aside className="nxEsRail" aria-label="Signing">
            <section className="nxEsRailSec">
              <h3 className="nxEsRailTitle">Recipients</h3>
              {env.status === "draft" && <p className="nxEsHint">Not sent yet — finish preparing, then send for signature.</p>}
              <ol className="nxEsSignerList">
                {[...env.signers].sort((a, b) => a.order - b.order).map((s) => {
                  const isTurn = activeIds.includes(s.id);
                  return (
                    <li key={s.id} className={`nxEsSignerCard sc-${s.colorIndex}${signingAs === s.id ? " isSigningNow" : ""}`}>
                      <div className="nxEsSignerTop">
                        <span className="nxEsSignerDot" aria-hidden />
                        <strong className="nxEsSignerName">{s.name || s.role}</strong>
                        <span className={`nxEsSignerStatus is-${s.status}`}>{s.status}</span>
                      </div>
                      <div className="nxEsSignerFoot">
                        <span className="nxEsSignerMail">{s.email}</span>
                        {isTurn && s.id !== signingAs && (
                          <button type="button" className="nxEsBtn isPrimary isSm" onClick={() => startSigning(s.id)} data-testid={`esign-sign-as-${s.id}`}>
                            Sign now
                          </button>
                        )}
                        {!isTurn && s.status !== "signed" && env.signingOrder === "sequential" && env.status !== "draft" && (
                          <span className="nxEsHint">waiting for turn</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="nxEsHint isFoot">
                Demo note: in production each recipient opens their own emailed signing link; here you act for them.
              </p>
            </section>
            {signer && (
              <section className="nxEsRailSec">
                <h3 className="nxEsRailTitle">Your fields</h3>
                <ul className="nxEsTaskList">
                  {myFields.sort((a, b) => a.page - b.page || a.y - b.y).map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={isFieldFilled(f) ? "nxEsTask isDone" : f.required ? "nxEsTask isRequired" : "nxEsTask"}
                        onClick={() => { setPageIndex(f.page); setSelectedId(f.id); }}
                      >
                        <span className="nxEsTaskMark" aria-hidden>{isFieldFilled(f) ? "✓" : ""}</span>
                        {f.label || FIELD_TYPE_LABEL[f.type]} · p.{f.page + 1}
                        {f.required && !isFieldFilled(f) && <em> required</em>}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button" className="nxEsBtn isPrimary isBlock" data-testid="esign-finish"
                  disabled={missingRequired.length > 0}
                  onClick={() => void finishSigning()}
                >
                  {missingRequired.length > 0
                    ? `${missingRequired.length} required field${missingRequired.length === 1 ? "" : "s"} left`
                    : "Finish signing"}
                </button>
              </section>
            )}
          </aside>
        )}

        {tab === "audit" && (
          <aside className="nxEsRail" aria-label="Status">
            <section className="nxEsRailSec">
              <h3 className="nxEsRailTitle">Certificate</h3>
              <div className="nxEsCert" data-testid="esign-certificate">
                <div className="nxEsCertRow"><span>Status</span><strong>{STATUS_LABEL[env.status]}</strong></div>
                <div className="nxEsCertRow"><span>Envelope</span><strong>{env.id}</strong></div>
                <div className="nxEsCertRow"><span>Sent</span><strong>{fmtTime(env.sentAt)}</strong></div>
                <div className="nxEsCertRow"><span>Completed</span><strong>{fmtTime(env.completedAt)}</strong></div>
                <div className="nxEsCertRow"><span>Certificate</span><strong>{env.certificateId ?? "issued on completion"}</strong></div>
              </div>
              {env.status === "completed" && (
                <button type="button" className="nxEsBtn isBlock" onClick={downloadCompleted}>Download signed PDF</button>
              )}
              <p className="nxEsHint isFoot">Demo surface — the certificate documents this demo flow, not legal compliance.</p>
            </section>
            <section className="nxEsRailSec">
              <h3 className="nxEsRailTitle">Signers</h3>
              <ol className="nxEsSignerList">
                {[...env.signers].sort((a, b) => a.order - b.order).map((s) => (
                  <li key={s.id} className={`nxEsSignerCard sc-${s.colorIndex}`}>
                    <div className="nxEsSignerTop">
                      <span className="nxEsSignerDot" aria-hidden />
                      <strong className="nxEsSignerName">{s.name || s.role}</strong>
                      <span className={`nxEsSignerStatus is-${s.status}`}>{s.status}</span>
                    </div>
                    <div className="nxEsSignerFoot">
                      <span className="nxEsSignerMail">viewed {fmtTime(s.viewedAt)} · signed {fmtTime(s.signedAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        )}

        {/* document canvas */}
        <div className="nxEsCanvasWrap">
          <div className="nxEsCanvasBar">
            <div className="nxEsPageNav">
              <button type="button" className="nxEsIconBtn" aria-label="Previous page" disabled={pageIndex <= 0} onClick={() => gotoPage(pageIndex - 1)}>‹</button>
              <span className="nxEsPageLabel">Page {Math.min(pageIndex + 1, Math.max(pages.length, 1))} / {Math.max(pages.length, env.document?.pageCount ?? 0, 1)}</span>
              <button type="button" className="nxEsIconBtn" aria-label="Next page" disabled={pageIndex >= pages.length - 1} onClick={() => gotoPage(pageIndex + 1)}>›</button>
            </div>
            {signer && tab === "sign" && (
              <span className="nxEsSigningAs">Signing as <strong>{signer.name}</strong></span>
            )}
            <div className="nxEsZoom">
              <button type="button" className="nxEsIconBtn" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => setZoomManual((z) => Math.max(ZOOM_MIN, +(z - 0.15).toFixed(2)))}>−</button>
              <span className="nxEsPageLabel">{Math.round(zoom * 100)}%</span>
              <button type="button" className="nxEsIconBtn" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => setZoomManual((z) => Math.min(ZOOM_MAX, +(z + 0.15).toFixed(2)))}>+</button>
            </div>
          </div>
          <div className="nxEsScroll" ref={scrollRef} data-testid="esign-scroll">
            {!env.document && (
              <div className="nxEsEmpty">
                <p>No document yet.</p>
                <button type="button" className="nxEsBtn isPrimary" onClick={() => fileRef.current?.click()}>Load a PDF or image…</button>
              </div>
            )}
            {docError && <div className="nxEsNotice isError" role="alert">{docError}</div>}
            {pages.map((p) => (
              <PageView
                key={p.index} page={p} zoom={zoom}
                onVisible={() => setPageIndex(p.index)}
              >
                <div
                  className={"nxEsFieldLayer" + (armedType ? " isArming" : "")}
                  data-page={p.index}
                  onDragOver={(e) => { if (editable) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                  onDrop={(e) => {
                    if (!editable) return;
                    const t = e.dataTransfer.getData("application/x-esign-field") as EsignFieldType;
                    if (!t) return;
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    placeField(t, p.index, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
                  }}
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (editable && armedType) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      placeField(armedType, p.index, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
                    } else setSelectedId(null);
                  }}
                >
                  {env.fields.filter((f) => f.page === p.index).map((f) => (
                    <FieldBox
                      key={f.id} field={f} env={env}
                      mode={tab === "prepare" && editable ? "edit" : tab === "sign" && signer && f.signerId === signer.id ? "fill" : "view"}
                      selected={selectedId === f.id}
                      onSelect={() => setSelectedId(f.id)}
                      onPatch={(patch) => patchField(f.id, patch)}
                      onRemove={() => removeField(f.id)}
                      onFill={(v) => fillField(f.id, v)}
                      onOpenSignature={() => setSigDialog({ fieldId: f.id, kind: f.type === "initials" ? "initials" : "signature" })}
                    />
                  ))}
                </div>
              </PageView>
            ))}
          </div>
        </div>

        {/* right rail: field properties (prepare, when selected) */}
        {tab === "prepare" && editable && selected && (
          <aside className="nxEsProps" aria-label="Field properties">
            <div className="nxEsRailTitleRow">
              <h3 className="nxEsRailTitle">{FIELD_TYPE_LABEL[selected.type]}</h3>
              <button type="button" className="nxEsIconBtn" aria-label="Close properties" onClick={() => setSelectedId(null)}>×</button>
            </div>
            <label className="nxEsFieldLabel" htmlFor="es-prop-label">Label</label>
            <input
              id="es-prop-label" className="nxEsInput" value={selected.label ?? ""}
              placeholder={FIELD_TYPE_LABEL[selected.type]}
              onChange={(e) => patchField(selected.id, { label: e.target.value })}
            />
            <label className="nxEsFieldLabel" htmlFor="es-prop-signer">Assigned to</label>
            <select
              id="es-prop-signer" className="nxEsInput" value={selected.signerId}
              onChange={(e) => patchField(selected.id, { signerId: e.target.value })}
            >
              {env.signers.map((s) => <option key={s.id} value={s.id}>{s.name || s.role}</option>)}
            </select>
            <label className="nxEsCheckRow">
              <input
                type="checkbox" checked={selected.required}
                onChange={(e) => patchField(selected.id, { required: e.target.checked })}
              />
              Required
            </label>
            {selected.type === "dropdown" && (
              <>
                <label className="nxEsFieldLabel" htmlFor="es-prop-options">Options (one per line)</label>
                <textarea
                  id="es-prop-options" className="nxEsInput isArea" rows={4}
                  value={(selected.options ?? []).join("\n")}
                  onChange={(e) => patchField(selected.id, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                />
              </>
            )}
            <button type="button" className="nxEsBtn isDanger isBlock" onClick={() => removeField(selected.id)}>Delete field</button>
          </aside>
        )}

        {tab === "audit" && (
          <div className="nxEsAuditPane" aria-label="Audit trail">
            <h3 className="nxEsRailTitle">Audit trail</h3>
            <ol className="nxEsAudit" data-testid="esign-audit">
              {[...env.events].reverse().map((ev) => (
                <li key={ev.id} className={`nxEsAuditRow t-${ev.type}`}>
                  <span className="nxEsAuditDot" aria-hidden />
                  <div>
                    <div className="nxEsAuditHead">
                      <strong>{auditTitle(ev.type)}</strong>
                      <time dateTime={ev.at}>{fmtTime(ev.at)}</time>
                    </div>
                    <div className="nxEsAuditDetail">{ev.actor} — {ev.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* send review dialog — the review surface before the outward action */}
      {sendOpen && (
        <div className="nxEsOverlay" role="presentation" onClick={() => setSendOpen(false)}>
          <div className="nxEsDialog isWide" role="dialog" aria-modal="true" aria-label="Review before sending" onClick={(e) => e.stopPropagation()}>
            <header className="nxEsDialogHead"><h2>Review before sending</h2>
              <button type="button" className="nxEsIconBtn" aria-label="Close" onClick={() => setSendOpen(false)}>×</button>
            </header>
            <div className="nxEsPad">
              <div className="nxEsReviewDoc">
                <strong>{env.document?.name}</strong>
                <span>{env.document?.pageCount} pages · {env.fields.length} fields · {env.signingOrder === "sequential" ? "signs in order" : "signs in any order"}</span>
              </div>
              <table className="nxEsReviewTable">
                <thead><tr><th>#</th><th>Recipient</th><th>Role</th><th>Fields</th><th>Signing link</th></tr></thead>
                <tbody>
                  {buildSendRequest().recipients.map((r) => (
                    <tr key={r.signerId}>
                      <td>{r.order}</td>
                      <td><strong>{r.name}</strong><br /><span className="nxEsSignerMail">{r.email}</span></td>
                      <td>{r.role}</td>
                      <td>{r.fieldCount} ({r.requiredFieldCount} required)</td>
                      <td><code className="nxEsCode">{r.signingUrl}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={config?.onSend ? "nxEsNotice isInfo" : "nxEsNotice"} role="note">
                {config?.onSend
                  ? "Delivery is wired to your configured send handler."
                  : "DEMO MODE — no emails will be sent. Recipients are simulated in the Sign tab. Wire ESignConfig.onSend for real delivery (docs/RECIPES.md)."}
              </div>
            </div>
            <footer className="nxEsDialogFoot">
              <span className="nxEsLegal">Sending locks fields and signers.</span>
              <div className="nxEsBtnRow">
                <button type="button" className="nxEsBtn" onClick={() => setSendOpen(false)}>Cancel</button>
                <button type="button" className="nxEsBtn isPrimary" onClick={() => void confirmSend()} data-testid="esign-confirm-send">
                  {config?.onSend ? "Send to recipients" : "Send (demo)"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* template picker */}
      {tplOpen && (
        <div className="nxEsOverlay" role="presentation" onClick={() => setTplOpen(false)}>
          <div className="nxEsDialog" role="dialog" aria-modal="true" aria-label="Apply a template" onClick={(e) => e.stopPropagation()}>
            <header className="nxEsDialogHead"><h2>Apply a template</h2>
              <button type="button" className="nxEsIconBtn" aria-label="Close" onClick={() => setTplOpen(false)}>×</button>
            </header>
            <div className="nxEsPad">
              <p className="nxEsHint">Replaces the current field layout; roles map to signers in order.</p>
              <ul className="nxEsTplList">
                {env.templates.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="nxEsTplCard" onClick={() => applyTemplate(t.id)} disabled={!editable}>
                      <strong>{t.name}</strong>
                      <span>{t.fields.length} fields · roles: {t.roles.join(" → ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <SignatureDialog
        open={!!sigDialog}
        kind={sigDialog?.kind ?? "signature"}
        signerName={signer?.name ?? ""}
        onCancel={() => setSigDialog(null)}
        onDone={(sig) => {
          if (!sigDialog) return;
          const f = env.fields.find((x) => x.id === sigDialog.fieldId);
          if (f) fillField(f.id, { type: f.type === "initials" ? "initials" : "signature", signature: sig });
          setSigDialog(null);
        }}
      />
    </div>
  );

  function gotoPage(i: number) {
    setPageIndex(i);
    const el = scrollRef.current?.querySelector(`[data-pageview="${i}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

/* ---------------------------------------------------------------- PageView */

function PageView({ page, zoom, children, onVisible }: {
  page: PdfPageHandle; zoom: number; children: React.ReactNode; onVisible: () => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let dead = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    void page.render(canvas, zoom).catch(() => { if (!dead) { /* render race on unmount */ } });
    return () => { dead = true; page.cancel(canvas); };
  }, [page, zoom]);
  React.useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.5) onVisible();
    }, { threshold: [0.55] });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const w = Math.round(page.width * zoom);
  const h = Math.round(page.height * zoom);
  return (
    <div ref={hostRef} className="nxEsPage" data-pageview={page.index} style={{ width: w, height: h }}>
      <canvas ref={canvasRef} className="nxEsPageCanvas" style={{ width: w, height: h }} aria-label={`Page ${page.index + 1}`} />
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- FieldBox */

function FieldBox({ field: f, env, mode, selected, onSelect, onPatch, onRemove, onFill, onOpenSignature }: {
  field: EsignField;
  env: EsignEnvelope;
  mode: "edit" | "fill" | "view";
  selected: boolean;
  onSelect: () => void;
  onPatch: (p: Partial<EsignField>) => void;
  onRemove: () => void;
  onFill: (v: EsignFieldValue | undefined) => void;
  onOpenSignature: () => void;
}) {
  const signer = env.signers.find((s) => s.id === f.signerId);
  const color = signer?.colorIndex ?? 0;
  const ref = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ kind: "move" | "resize"; startX: number; startY: number; f0: EsignField } | null>(null);

  const onPointerDown = (e: React.PointerEvent, kind: "move" | "resize") => {
    if (mode !== "edit") return;
    e.stopPropagation();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, startX: e.clientX, startY: e.clientY, f0: { ...f } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const layer = ref.current?.parentElement;
    if (!d || !layer) return;
    const rect = layer.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    if (d.kind === "move") {
      onPatch({ x: clamp(d.f0.x + dx, 0, 1 - f.w), y: clamp(d.f0.y + dy, 0, 1 - f.h) });
    } else {
      onPatch({ w: clamp(d.f0.w + dx, 0.02, 1 - f.x), h: clamp(d.f0.h + dy, 0.012, 1 - f.y) });
    }
  };
  const onPointerUp = () => { drag.current = null; };

  const filled = isFieldFilled(f);
  const label = f.label || FIELD_TYPE_LABEL[f.type];

  const fillControl = () => {
    if (mode !== "fill") return null;
    switch (f.type) {
      case "signature":
      case "initials":
        return (
          <button type="button" className="nxEsFillBtn" onClick={onOpenSignature} data-testid={`esign-fill-${f.id}`}>
            {filled ? <SignaturePreview value={f.value} /> : `${f.type === "initials" ? "Initial" : "Sign"} here`}
          </button>
        );
      case "date":
        return (
          <input
            type="date" className="nxEsFillInput" aria-label={label} data-testid={`esign-fill-${f.id}`}
            value={f.value?.type === "date" ? f.value.text : ""}
            onFocus={(e) => {
              if (!(f.value?.type === "date" && f.value.text)) {
                const today = new Date().toISOString().slice(0, 10);
                onFill({ type: "date", text: today });
                (e.target as HTMLInputElement).value = today;
              }
            }}
            onChange={(e) => onFill(e.target.value ? { type: "date", text: e.target.value } : undefined)}
          />
        );
      case "text":
        return (
          <input
            type="text" className="nxEsFillInput" aria-label={label} placeholder={label} data-testid={`esign-fill-${f.id}`}
            value={f.value?.type === "text" ? f.value.text : ""}
            onChange={(e) => onFill(e.target.value ? { type: "text", text: e.target.value } : undefined)}
          />
        );
      case "checkbox":
        return (
          <input
            type="checkbox" className="nxEsFillCheck" aria-label={label} data-testid={`esign-fill-${f.id}`}
            checked={f.value?.type === "checkbox" ? f.value.checked : false}
            onChange={(e) => onFill({ type: "checkbox", checked: e.target.checked })}
          />
        );
      case "dropdown":
        return (
          <select
            className="nxEsFillInput" aria-label={label} data-testid={`esign-fill-${f.id}`}
            value={f.value?.type === "dropdown" ? f.value.text : ""}
            onChange={(e) => onFill(e.target.value ? { type: "dropdown", text: e.target.value } : undefined)}
          >
            <option value="">{label}…</option>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
    }
  };

  return (
    <div
      ref={ref}
      className={[
        "nxEsField", `fc-${color}`, `ft-${f.type}`, `m-${mode}`,
        selected ? "isSelected" : "", filled ? "isFilled" : "", f.required ? "isRequired" : "",
      ].filter(Boolean).join(" ")}
      style={{ left: pct(f.x), top: pct(f.y), width: pct(f.w), height: pct(f.h) }}
      role={mode === "edit" ? "button" : undefined}
      tabIndex={mode === "edit" ? 0 : undefined}
      aria-label={`${label} — ${signer?.name || signer?.role || "unassigned"}${f.required ? ", required" : ""}`}
      data-testid={`esign-field-${f.id}`}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => { if (mode === "edit" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}
    >
      {mode !== "fill" && (
        <span className="nxEsFieldTag">
          {label}
          {f.required && <em aria-hidden> *</em>}
        </span>
      )}
      {mode === "view" && filled && <SignatureOrValue field={f} />}
      {fillControl()}
      {mode === "edit" && selected && (
        <>
          <button
            type="button" className="nxEsFieldDel" aria-label={`Delete ${label}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >×</button>
          <span className="nxEsFieldGrip" aria-hidden onPointerDown={(e) => onPointerDown(e, "resize")} />
        </>
      )}
    </div>
  );
}

function SignaturePreview({ value }: { value?: EsignFieldValue }) {
  if (!value || (value.type !== "signature" && value.type !== "initials")) return null;
  const sig = value.signature;
  if (sig.dataUrl) return <img className="nxEsSigImg" src={sig.dataUrl} alt="Signature" />;
  return <span className="nxEsSigText" style={{ fontFamily: signatureFontCss(sig.font) }}>{sig.text}</span>;
}

function SignatureOrValue({ field: f }: { field: EsignField }) {
  const v = f.value;
  if (!v) return null;
  if (v.type === "signature" || v.type === "initials") return <SignaturePreview value={v} />;
  if (v.type === "checkbox") return <span className="nxEsSigText">{v.checked ? "\u2611" : "\u2610"}</span>;
  return <span className="nxEsValText">{v.text}</span>;
}

function FieldGlyph({ type }: { type: EsignFieldType }) {
  const g: Record<EsignFieldType, string> = {
    signature: "✍", initials: "AB", date: "📅", text: "T", checkbox: "☑", dropdown: "▾",
  };
  return <span className="nxEsGlyph" aria-hidden>{g[type]}</span>;
}

/* ----------------------------------------------------------------- helpers */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
function auditTitle(t: string): string {
  return t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
