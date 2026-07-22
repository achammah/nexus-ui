/* ClaimWorkspace — the claims DECISION surface. Three columns: an activity/
   assessment rail (the audit spine + the machine's recommendation), a
   multi-modal STAGE in the centre (the 3D model, photos and documents,
   switchable via attachment cards), and the DECISION panel on the right where
   the human adjudicates: adjusted amount, reason, note, submit — the decision
   WRITES into the snapshot (and through onDecision to the host's workflow).
   Damage findings are authored ANNOTATIONS anchored to the geometry (severity,
   part, note, verification), kept in sync between the pins on the model and
   the editable list. The 3D pane is Viewer3DSurface — one pane of the tool,
   not the tool. */
import * as React from "react";
import Viewer3DSurface from "./Viewer3DSurface";
import type {
  ClaimAnnotation, ClaimAttachment, ClaimDecision, ClaimSeverity,
  Viewer3DHotspot, Viewer3DSnapshot,
} from "./scene";
import "./viewer3d.css";

export interface ClaimWorkspaceProps {
  /* snapshot with `claim` config (seedClaim() shape) */
  value: Viewer3DSnapshot;
  onChange?: (snapshot: Viewer3DSnapshot) => void;
  /* fired on Submit Decision — wire to a Nexus workflow/agent in the host */
  onDecision?: (decision: ClaimDecision) => void | Promise<void>;
  reloadNonce?: number;
  className?: string;
  "data-testid"?: string;
}

const SEV_TONE: Record<ClaimSeverity, Viewer3DHotspot["tone"]> = {
  severe: "danger",
  moderate: "warn",
  minor: "accent",
};
const SEV_LABEL: Record<ClaimSeverity, string> = { severe: "Severe", moderate: "Moderate", minor: "Minor" };

const fmtMoney = (n: number | undefined, cur = "EUR"): string =>
  n === undefined ? "—" : `${cur} ${n.toLocaleString("en-IE")}`;

const nowTime = (): string => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export function ClaimWorkspace({ value, onChange, onDecision, reloadNonce, className, ...rest }: ClaimWorkspaceProps) {
  const snapRef = React.useRef(value);
  snapRef.current = value;
  const claim = value.claim ?? {};
  const cur = claim.summary?.currency ?? "EUR";
  const annotations = React.useMemo(() => claim.annotations ?? [], [claim.annotations]);

  const [activeAtt, setActiveAtt] = React.useState<string>(
    claim.attachments?.find((a) => a.kind === "model")?.id ?? claim.attachments?.[0]?.id ?? "");
  const [selectedAnn, setSelectedAnn] = React.useState<string | null>(null);
  const [annotating, setAnnotating] = React.useState(false);
  const [submitState, setSubmitState] = React.useState<"idle" | "busy" | "done">(claim.decision?.submittedAt ? "done" : "idle");

  const att = claim.attachments?.find((a) => a.id === activeAtt);
  const stageIsModel = !att || att.kind === "model";

  /* the stage's snapshot: annotations rendered as hotspot pins (derived —
     merged back OUT of any onChange from the surface) */
  const stageValue = React.useMemo<Viewer3DSnapshot>(() => ({
    ...value,
    title: undefined,
    hotspots: annotations.map((a) => ({
      id: a.id,
      label: a.label,
      detail: [a.part, a.note, a.author ? `${a.author}${a.verified ? " · verified" : ""}` : null].filter(Boolean).join(" — "),
      tone: SEV_TONE[a.severity],
      position: a.position,
    })),
  }), [value, annotations]);

  const persist = React.useCallback((patch: Partial<Viewer3DSnapshot>) => {
    onChange?.({ ...snapRef.current, ...patch });
  }, [onChange]);
  const patchClaim = React.useCallback((patch: Partial<NonNullable<Viewer3DSnapshot["claim"]>>) => {
    persist({ claim: { ...snapRef.current.claim, ...patch } });
  }, [persist]);

  const onSurfaceChange = (next: Viewer3DSnapshot) => {
    /* strip the derived hotspots + title before persisting viewer state */
    persist({ autoRotate: next.autoRotate, planView: next.planView, units: next.units });
  };

  /* ---- annotations ---- */

  const patchAnnotation = (id: string, patch: Partial<ClaimAnnotation>) =>
    patchClaim({ annotations: annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const addAnnotation = (point: [number, number, number]) => {
    const id = `an-${Date.now().toString(36)}`;
    patchClaim({
      annotations: [...annotations, {
        id, label: "New finding", severity: "moderate",
        author: claim.summary?.adjuster ?? "Adjuster", verified: false, position: point,
      }],
    });
    setAnnotating(false);
    setSelectedAnn(id);
  };

  const removeAnnotation = (id: string) => {
    patchClaim({ annotations: annotations.filter((a) => a.id !== id) });
    if (selectedAnn === id) setSelectedAnn(null);
  };

  /* ---- decision ---- */

  const decision = claim.decision ?? {};
  const setDecision = (patch: Partial<ClaimDecision>) => patchClaim({ decision: { ...decision, ...patch } });

  const submit = async () => {
    const final: ClaimDecision = { ...decision, submittedAt: new Date().toISOString() };
    setSubmitState("busy");
    try {
      await onDecision?.(final);
      patchClaim({
        decision: final,
        activity: [...(claim.activity ?? []), {
          id: `a-${Date.now().toString(36)}`, time: nowTime(), tone: "ok",
          text: `Decision submitted — ${final.choice ?? "?"}${final.amount !== undefined ? ` · ${fmtMoney(final.amount, cur)}` : ""}`,
        }],
      });
      setSubmitState("done");
    } catch {
      setSubmitState("idle");
    }
  };

  const sel = annotations.find((a) => a.id === selectedAnn) ?? null;
  const checksIcon = { pass: "✓", warn: "⚠", fail: "✕" } as const;

  return (
    <div className={["nxCW", className].filter(Boolean).join(" ")} data-testid="claim-workspace" {...rest}>
      {/* ---- left rail: activity + assessment ---- */}
      <aside className="nxCWRail" aria-label="Claim activity and assessment">
        <section className="nxCWCard">
          <header className="nxCWHead">
            <span>Live activity</span>
            <span className="nxCWLive" data-testid="cw-live"><i /> Active</span>
          </header>
          <ol className="nxCWFeed" data-testid="cw-activity">
            {(claim.activity ?? []).map((ev) => (
              <li key={ev.id} className={`nxCWEvent nxCWEvent--${ev.tone ?? "info"}`}>
                <i aria-hidden="true" />
                <span className="nxCWEventText">{ev.text}</span>
                <time>{ev.time}</time>
              </li>
            ))}
          </ol>
        </section>

        {claim.assessment && (
          <section className="nxCWCard" data-testid="cw-assessment">
            <header className="nxCWHead"><span>Agent assessment</span></header>
            <div className="nxCWVerdict">{claim.assessment.verdict}</div>
            {claim.assessment.rationale && <p className="nxCWRationale">{claim.assessment.rationale}</p>}
            <ul className="nxCWChecks">
              {claim.assessment.checks.map((c) => (
                <li key={c.id} className={`nxCWCheck nxCWCheck--${c.status}`} data-testid={`cw-check-${c.id}`}>
                  <i aria-hidden="true">{checksIcon[c.status]}</i>{c.label}
                </li>
              ))}
            </ul>
            {claim.assessment.reasoning && (
              <div className="nxCWReasoning">
                <div className="nxCWReasoningKicker">Agent reasoning</div>
                {claim.assessment.reasoning}
              </div>
            )}
          </section>
        )}
      </aside>

      {/* ---- centre: multi-modal stage ---- */}
      <div className="nxCWStageCol">
        <div className="nxCWStageHead">
          <span className="nxCWStageName" data-testid="cw-stage-name">{att?.name ?? "Stage"}</span>
          {att?.status && <span className={`nxCWChip nxCWChip--${att.status}`}>{att.status.toUpperCase()}</span>}
          <span className="nxCWStageMeta">{claim.summary?.incidentDate ?? ""}</span>
          {stageIsModel && (
            <button type="button" className="nxV3Btn" aria-pressed={annotating} data-testid="cw-annotate"
              onClick={() => setAnnotating((a) => !a)}>
              {annotating ? "Click the model…" : "Add annotation"}
            </button>
          )}
        </div>

        <div className={`nxCWStage${annotating ? " nxCWStage--annotating" : ""}`}>
          {stageIsModel ? (
            <Viewer3DSurface
              value={stageValue}
              onChange={onSurfaceChange}
              reloadNonce={reloadNonce}
              toolbar={false}
              activeHotspotId={selectedAnn}
              onHotspotOpen={(id) => setSelectedAnn(id)}
              annotateMode={annotating}
              onStagePick={addAnnotation}
              data-testid="cw-surface"
            />
          ) : att?.kind === "photo" && att.url ? (
            <figure className="nxCWPhoto" data-testid="cw-photo">
              <img src={att.url} alt={att.caption ?? att.name} />
              {att.caption && <figcaption>{att.caption}</figcaption>}
            </figure>
          ) : (
            <div className="nxCWDoc" data-testid="cw-doc">
              {att?.url
                ? <object data={att.url} type="application/pdf" aria-label={att.name}><p>{att.name}</p></object>
                : <p>{att?.name} — {att?.caption ?? "document preview unavailable in the demo"}</p>}
            </div>
          )}
        </div>

        <div className="nxCWAttach" role="tablist" aria-label="Attachments" data-testid="cw-attachments">
          {(claim.attachments ?? []).map((a: ClaimAttachment) => (
            <button key={a.id} type="button" role="tab" aria-selected={a.id === activeAtt}
              className="nxCWAttCard" data-testid={`cw-att-${a.id}`}
              onClick={() => setActiveAtt(a.id)}>
              <span className="nxCWAttThumb" data-kind={a.kind}>
                {a.kind === "photo" && a.url ? <img src={a.url} alt="" /> : a.kind === "pdf" ? "PDF" : "3D"}
              </span>
              <span className="nxCWAttName">{a.name}</span>
              {a.status && <span className={`nxCWChip nxCWChip--${a.status}`}>{a.status.toUpperCase()}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ---- right: decision panel ---- */}
      <aside className="nxCWDecide" aria-label="Decision">
        <section className="nxCWCard">
          <header className="nxCWHead"><span>Decision</span></header>
          <div className="nxV3Seg nxCWSeg" role="group" aria-label="Decision">
            {(["approve", "partial", "deny"] as const).map((c) => (
              <button key={c} type="button" className="nxV3SegBtn" aria-pressed={decision.choice === c}
                data-testid={`cw-decide-${c}`} onClick={() => setDecision({ choice: c })}>
                {c[0].toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
          <label className="nxV3Field nxCWField">
            <span>Adjusted amount</span>
            <input type="number" step={50} value={decision.amount ?? claim.summary?.claimedAmount ?? 0}
              data-testid="cw-amount"
              onChange={(e) => setDecision({ amount: Number(e.target.value) })} />
          </label>
          {claim.summary?.claimedAmount !== undefined && decision.amount !== undefined
            && decision.amount !== claim.summary.claimedAmount && (
            <div className="nxCWWas">was {fmtMoney(claim.summary.claimedAmount, cur)}</div>
          )}
          <label className="nxV3Field nxCWField">
            <span>Reason</span>
            <select value={decision.reason ?? ""} data-testid="cw-reason"
              onChange={(e) => setDecision({ reason: e.target.value })}>
              <option value="">—</option>
              <option>Estimate above regional benchmark</option>
              <option>Consistent with policy terms</option>
              <option>Damage pre-existing</option>
              <option>Coverage exclusion applies</option>
            </select>
          </label>
          <label className="nxCWNote">
            <span>Adjuster note</span>
            <textarea rows={3} value={decision.note ?? ""} data-testid="cw-note"
              onChange={(e) => setDecision({ note: e.target.value })} />
          </label>
          <button type="button" className="nxCWSubmit" data-testid="cw-submit"
            disabled={!decision.choice || submitState === "busy"}
            onClick={() => void submit()}>
            {submitState === "done" ? `Submitted ${decision.submittedAt ? new Date(decision.submittedAt).toLocaleTimeString() : ""}` : submitState === "busy" ? "Submitting…" : "Submit decision"}
          </button>
        </section>

        <section className="nxCWCard" data-testid="cw-damage">
          <header className="nxCWHead"><span>Damage findings</span><em>{annotations.length}</em></header>
          <ul className="nxCWFindings">
            {annotations.map((a) => (
              <li key={a.id}>
                <button type="button" className="nxCWFinding" aria-pressed={selectedAnn === a.id}
                  data-testid={`cw-finding-${a.id}`}
                  onClick={() => { setActiveAtt(claim.attachments?.find((x) => x.kind === "model")?.id ?? activeAtt); setSelectedAnn(selectedAnn === a.id ? null : a.id); }}>
                  <i className={`nxCWDot nxCWDot--${a.severity}`} />
                  <span className="nxCWFindingLabel">{a.label}</span>
                  <span className="nxCWFindingMeta">{SEV_LABEL[a.severity]}{a.verified ? " · ✓" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
          {sel && (
            <div className="nxCWAnnEdit" data-testid="cw-ann-editor">
              <label className="nxV3Field nxCWField"><span>Label</span>
                <input value={sel.label} data-testid="cw-ann-label"
                  onChange={(e) => patchAnnotation(sel.id, { label: e.target.value })} /></label>
              <label className="nxV3Field nxCWField"><span>Part</span>
                <input value={sel.part ?? ""} onChange={(e) => patchAnnotation(sel.id, { part: e.target.value || undefined })} /></label>
              <label className="nxV3Field nxCWField"><span>Severity</span>
                <select value={sel.severity} data-testid="cw-ann-severity"
                  onChange={(e) => patchAnnotation(sel.id, { severity: e.target.value as ClaimSeverity })}>
                  <option value="minor">Minor</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select></label>
              <label className="nxCWNote"><span>Note</span>
                <textarea rows={2} value={sel.note ?? ""} onChange={(e) => patchAnnotation(sel.id, { note: e.target.value || undefined })} /></label>
              <div className="nxCWAnnRow">
                <label className="nxV3Layer">
                  <input type="checkbox" checked={!!sel.verified} data-testid="cw-ann-verified"
                    onChange={(e) => patchAnnotation(sel.id, { verified: e.target.checked })} />
                  <span>Verified</span>
                </label>
                <button type="button" className="nxV3Btn" data-testid="cw-ann-delete" onClick={() => removeAnnotation(sel.id)}>Delete</button>
              </div>
            </div>
          )}
        </section>

        {claim.summary && (
          <section className="nxCWCard" data-testid="cw-summary">
            <header className="nxCWHead"><span>Claim summary</span></header>
            <dl className="nxCWDl">
              {([
                ["Claimant", claim.summary.claimant],
                ["Policy", claim.summary.policy],
                ["Type", claim.summary.type],
                ["Vehicle", claim.summary.vehicle],
                ["VIN", claim.summary.vin],
                ["Incident date", claim.summary.incidentDate],
                ["Location", claim.summary.location],
                ["Claimed amount", fmtMoney(claim.summary.claimedAmount, cur)],
                ["Deductible", fmtMoney(claim.summary.deductible, cur)],
              ] as const).filter(([, v]) => v).map(([k, v]) => (
                <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
              ))}
            </dl>
          </section>
        )}
      </aside>
    </div>
  );
}

export default ClaimWorkspace;
