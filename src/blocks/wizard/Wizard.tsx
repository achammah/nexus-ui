import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Link2, Sparkles } from "lucide-react";
import { ChipListInput } from "./ChipListInput";
import { SourcesInput } from "./SourcesInput";
import { type Ans, type Kind, type Q, type Sources, asList, asSources } from "./types";
import "./wizard.css";

/* Wizard — a config-driven multi-step step engine: a `Q[]` renders one step at a
   time with a progress bar + slide animation, `required` gates Next, a generic
   review screen lists every answered question, and onComplete(answers) fires the
   final action. An optional `landing` renders the "guided vs blank" 2-choice entry
   first. */

type KindRenderer = (ctx: {
  q: Q;
  value: string | string[] | Sources | undefined;
  onChange: (v: unknown) => void;
  onEnter: () => void;
  /* unconditional forward step (no canNext gate) — for a kind where the
     interaction itself IS the completed answer, e.g. picking a select option */
  advance: () => void;
}) => React.ReactNode;

/* Kind renderer registry — extend by spreading this object with a new Kind. */
export const kindRenderers: Record<Kind, KindRenderer> = {
  select: ({ q, value, onChange, advance }) => (
    <div className="nxwiz-opts">
      {(q.options ?? []).map((o) => (
        <button
          key={o}
          className={`nxwiz-opt${value === o ? " is-on" : ""}`}
          data-testid={`wizard-opt-${o}`}
          onClick={() => {
            onChange(o);
            setTimeout(advance, 140);
          }}
        >
          {o}
        </button>
      ))}
    </div>
  ),
  text: ({ q, value, onChange, onEnter }) => (
    <input
      className="nxwiz-input"
      data-testid="wizard-input"
      value={String(value ?? "")}
      placeholder={q.placeholder}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter();
      }}
    />
  ),
  long: ({ q, value, onChange }) => (
    <textarea
      className="nxwiz-input nxwiz-area"
      data-testid="wizard-input"
      value={String(value ?? "")}
      placeholder={q.placeholder}
      rows={4}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  list: ({ q, value, onChange }) => (
    <ChipListInput value={asList(value)} onChange={onChange} placeholder={q.placeholder} suggestions={q.suggest} testIdPrefix="wizard-list" />
  ),
  sources: ({ value, onChange }) => {
    const s = asSources(value);
    return <SourcesInput urls={s.urls} docs={s.docs} onChange={onChange} testIdPrefix="wizard-src" />;
  },
};

export interface LandingConfig {
  eyebrow?: string;
  title: string;
  hint?: string;
  guidedLabel: string;
  guidedDesc: string;
  blankLabel: string;
  blankDesc: string;
  blankBusy?: boolean;
  onBlank: () => void;
}

export function Wizard({
  questions,
  onComplete,
  completing,
  completeLabel = "Complete",
  title = "Wizard",
  landing,
}: {
  questions: Q[];
  onComplete: (answers: Ans) => void;
  completing?: boolean;
  completeLabel?: string;
  title?: string;
  landing?: LandingConfig;
}) {
  const [mode, setMode] = React.useState<"choose" | "guided">(landing ? "choose" : "guided");
  const [step, setStep] = React.useState(0);
  const [ans, setAns] = React.useState<Ans>({});
  const [dir, setDir] = React.useState<1 | -1>(1);

  const done = step >= questions.length;
  const q = questions[step];
  const canNext = q
    ? q.required && (q.kind === "select" || q.kind === "text" || q.kind === "long")
      ? !!(ans[q.key] && String(ans[q.key]).trim())
      : true
    : true;
  const go = (d: 1 | -1) => {
    setDir(d);
    setStep((s) => Math.min(questions.length, Math.max(0, s + d)));
  };
  const setVal = (key: string, v: unknown) => setAns((a) => ({ ...a, [key]: v as Ans[string] }));

  if (mode === "choose" && landing) {
    return (
      <div className="nxwiz-root" data-testid="wizard-landing">
        <div className="nxwiz-eyebrow" style={{ marginBottom: 18 }}>
          <Sparkles size={13} /> {landing.eyebrow ?? title}
        </div>
        <h1 className="nxwiz-q" style={{ marginBottom: 10 }}>
          {landing.title}
        </h1>
        {landing.hint && (
          <p className="nxwiz-hint" style={{ marginBottom: 30 }}>
            {landing.hint}
          </p>
        )}
        <div className="nxwiz-choose">
          <button className="nxwiz-choice" data-testid="wizard-choose-guided" onClick={() => setMode("guided")}>
            <Sparkles size={22} />
            <div className="nxwiz-choice-h">{landing.guidedLabel}</div>
            <div className="nxwiz-choice-d">{landing.guidedDesc}</div>
          </button>
          <button className="nxwiz-choice" data-testid="wizard-choose-blank" disabled={landing.blankBusy} onClick={landing.onBlank}>
            <div className="nxwiz-choice-h">{landing.blankBusy ? "Creating…" : landing.blankLabel}</div>
            <div className="nxwiz-choice-d">{landing.blankDesc}</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nxwiz-root">
      <div className="nxwiz-head">
        <div className="nxwiz-eyebrow">
          <Sparkles size={13} /> {title}
        </div>
        <div className="nxwiz-prog">
          <span style={{ width: `${(Math.min(step, questions.length) / questions.length) * 100}%` }} />
        </div>
        <div className="nxwiz-count" data-testid="wizard-count">
          {Math.min(step + (done ? 0 : 1), questions.length)} / {questions.length}
        </div>
      </div>
      {!done ? (
        <div key={step} className={`nxwiz-card ${dir === 1 ? "in-r" : "in-l"}`}>
          <h1 className="nxwiz-q">{q.label}</h1>
          {q.hint && <p className="nxwiz-hint">{q.hint}</p>}
          {kindRenderers[q.kind]({ q, value: ans[q.key], onChange: (v) => setVal(q.key, v), onEnter: () => canNext && go(1), advance: () => go(1) })}
          <div className="nxwiz-nav">
            {step > 0 && (
              <button className="nxwiz-back" data-testid="wizard-back" onClick={() => go(-1)}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <span className="nxwiz-grow" />
            <button className="nxwiz-next" data-testid="wizard-next" disabled={!canNext} onClick={() => go(1)}>
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="nxwiz-card nxwiz-review in-r" data-testid="wizard-review">
          <div className="nxwiz-qn">Review</div>
          <div className="nxwiz-sum">
            {questions.map((qq) => {
              if (qq.kind === "list") {
                const items = asList(ans[qq.key]);
                if (!items.length) return null;
                return (
                  <Row key={qq.key} k={qq.label}>
                    <div className="nxwiz-sum-chips">
                      {items.map((c, i) => (
                        <span key={i} className="nxwiz-sum-chip">
                          {c}
                        </span>
                      ))}
                    </div>
                  </Row>
                );
              }
              if (qq.kind === "sources") {
                const s = asSources(ans[qq.key]);
                const all = [...s.urls, ...s.docs.map((d) => d.name)];
                if (!all.length) return null;
                return (
                  <Row key={qq.key} k={qq.label}>
                    <div className="nxwiz-sum-chips">
                      {all.map((c, i) => (
                        <span key={i} className="nxwiz-sum-chip nxwiz-sum-src">
                          <Link2 size={11} /> {c.length > 52 ? c.slice(0, 52) + "…" : c}
                        </span>
                      ))}
                    </div>
                  </Row>
                );
              }
              const v = ans[qq.key];
              if (!v) return null;
              return <Row key={qq.key} k={qq.label}>{String(v)}</Row>;
            })}
          </div>
          <div className="nxwiz-nav">
            <button className="nxwiz-back" data-testid="wizard-back" onClick={() => go(-1)}>
              <ArrowLeft size={14} /> Back
            </button>
            <span className="nxwiz-grow" />
            <button className="nxwiz-create" data-testid="wizard-complete" disabled={completing} onClick={() => onComplete(ans)}>
              {completing ? (
                <>
                  <span className="nxwiz-spin" /> Working…
                </>
              ) : (
                <>
                  <Check size={14} /> {completeLabel}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="nxwiz-sum-row">
      <span className="nxwiz-sum-k">{k}</span>
      <div className="nxwiz-sum-v">{children}</div>
    </div>
  );
}
