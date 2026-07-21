import * as React from "react";
import { Check } from "lucide-react";

/* Pipeline — a horizontal stage indicator over a config-declared set of states.
   Entity-agnostic: the states are just strings the caller supplies (a select field's
   options, a workflow's stages, anything). Steps before the current one read as done
   (accent), the current one is highlighted, an optional `inProgress` state shows a
   spinner. Chip is the standalone status pill it is built from. Pure `--nx-*` tokens. */

export type ChipTone = "accent" | "muted" | "ok" | "warn" | "danger";

export function Chip({ label, tone = "muted" }: { label: string; tone?: ChipTone }) {
  return (
    <span className={`nxChip nxChip--${tone}`}>
      <span className="nxChip-dot" /> {label}
      <style>{CHIP_CSS}</style>
    </span>
  );
}

export function Pipeline({ states, current, inProgress }: {
  states: string[];
  current: string;
  inProgress?: string | null;
}) {
  const idx = Math.max(0, states.indexOf(current));
  return (
    <div className="nxPl" data-testid="suggest-pipeline">
      <style>{PL_CSS}</style>
      {states.map((s, i) => {
        const done = i < idx;
        const isCurrent = i === idx && !inProgress;
        const prog = !!inProgress && s === inProgress;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div className={`nxPl-line${i <= idx ? " is-done" : ""}`} />}
            <div className={`nxPl-step${done ? " is-done" : ""}${isCurrent ? " is-current" : ""}${prog ? " is-prog" : ""}`} title={s}>
              <span className="nxPl-dot">{prog ? <span className="nxPl-spin" /> : done ? <Check size={10} /> : i + 1}</span>
              <span className="nxPl-label">{s}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

const CHIP_CSS = `
.nxChip{display:inline-flex;align-items:center;gap:6px;font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);
  text-transform:uppercase;border:1px solid;padding:4px 8px;border-radius:var(--nx-radius-s)}
.nxChip-dot{width:7px;height:7px;border-radius:var(--nx-radius-s);flex:none;background:currentColor}
.nxChip--accent{color:var(--nx-accent);border-color:var(--nx-accent)}
.nxChip--muted{color:var(--nx-fg-muted);border-color:var(--nx-border-strong)}
.nxChip--ok{color:var(--nx-ok);border-color:var(--nx-ok)}
.nxChip--warn{color:var(--nx-warn);border-color:var(--nx-warn)}
.nxChip--danger{color:var(--nx-danger);border-color:var(--nx-danger)}
`;

const PL_CSS = `
.nxPl{display:flex;align-items:center}
.nxPl-step{display:inline-flex;align-items:center;gap:6px}
.nxPl-dot{width:18px;height:18px;flex:none;border:1px solid var(--nx-border);display:grid;place-items:center;
  font:var(--nx-text-micro);color:var(--nx-fg-muted);background:var(--nx-bg-raised);border-radius:50%;transition:background var(--nx-t-med) var(--nx-ease),border-color var(--nx-t-med) var(--nx-ease),color var(--nx-t-med) var(--nx-ease)}
.nxPl-label{font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);text-transform:uppercase;color:var(--nx-fg-muted);transition:color var(--nx-t-fast) var(--nx-ease)}
.nxPl-step:not(.is-current):not(.is-prog):not(.is-done) .nxPl-label{display:none}
@media(max-width:1100px){.nxPl-label{display:none}}
.nxPl-line{width:16px;height:1px;background:var(--nx-border);margin:0 5px;transition:background var(--nx-t-med) var(--nx-ease)}
.nxPl-line.is-done{background:var(--nx-accent)}
.nxPl-step.is-done .nxPl-dot{background:var(--nx-accent);border-color:var(--nx-accent);color:var(--nx-accent-fg)}
.nxPl-step.is-done .nxPl-label{color:var(--nx-fg)}
.nxPl-step.is-current .nxPl-dot,.nxPl-step.is-prog .nxPl-dot{border-color:var(--nx-accent)}
.nxPl-step.is-current .nxPl-label,.nxPl-step.is-prog .nxPl-label{color:var(--nx-accent);font-weight:600}
.nxPl-spin{width:11px;height:11px;border:2px solid var(--nx-accent-soft);border-top-color:var(--nx-accent);border-radius:50%;display:inline-block;animation:nxPlSpin var(--nx-t-spin) linear infinite}
@keyframes nxPlSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.nxPl-spin{animation:none}}
`;
