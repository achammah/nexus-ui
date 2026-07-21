import * as React from "react";
import { Check } from "lucide-react";
import type { FieldDef, ObjectConfig } from "../../types";
import type { ViewProps } from "../types";
import { Button } from "../../../primitives/Button";
import { formatCell } from "../../DataTable";
import { textToBlocks } from "../../NotionEditor";
import {
  coerceDraft,
  formSupported,
  requiredKeys,
  validateDraft,
  withStageDefault,
} from "../../fields/draft";
import { fieldDraftEditor } from "../../fields/draft-resolve";
import { fieldTypeDefinitions } from "../../fields/registry";

/* Form view — a fill-one-record surface over the unified field editors. Fields
   render in order (optionally in labeled `sections`) as a centered single
   column; submit creates through the host's store path (ViewProps.onCreate).
   Required is the config set plus any conditional-required rule met by the
   current draft (`requiredWhen`); a failed submit shows a jump-to-field error
   summary over the inline per-field errors, and success offers Create-another. */

type Section = { label?: string; fields: FieldDef[] };

export const formSectionsOf = (fields: FieldDef[], viewConfig: Record<string, unknown>): Section[] => {
  const supported = fields.filter((f) => formSupported(f, fieldTypeDefinitions));
  const byKey = new Map(supported.map((f) => [f.key, f] as const));
  const pick = (keys: unknown): FieldDef[] =>
    (Array.isArray(keys) ? keys : []).map((k) => byKey.get(String(k))).filter((f): f is FieldDef => !!f);

  const sectionsCfg = Array.isArray(viewConfig.sections) ? (viewConfig.sections as unknown[]) : null;
  if (sectionsCfg) {
    return sectionsCfg
      .map((s) => {
        const so = (s ?? {}) as Record<string, unknown>;
        return { label: typeof so.label === "string" ? so.label : undefined, fields: pick(so.fields) };
      })
      .filter((s) => s.fields.length > 0);
  }
  const keys = Array.isArray(viewConfig.fields) ? viewConfig.fields : null;
  return [{ label: undefined, fields: keys ? pick(keys) : supported }];
};

export const formFieldsOf = (fields: FieldDef[], viewConfig: Record<string, unknown>): FieldDef[] =>
  formSectionsOf(fields, viewConfig).flatMap((s) => s.fields);

/* conditional-required: a field is required when its rule's trigger field
   equals the rule value in the current draft. */
const requiredSetOf = (
  object: ObjectConfig,
  fields: FieldDef[],
  viewConfig: Record<string, unknown>,
  draft: Record<string, unknown>,
): string[] => {
  const base = new Set(requiredKeys(fields, (viewConfig.requiredOverrides as Record<string, boolean>) ?? {}));
  const rules = (viewConfig.requiredWhen as Record<string, { field: string; equals: unknown }>) ?? {};
  for (const [key, cond] of Object.entries(rules)) {
    if (cond && fields.some((f) => f.key === key) && draft[cond.field] === cond.equals) base.add(key);
  }
  return [...base];
};

export default function FormView({ object, users, viewConfig, onCreate, onOpen }: ViewProps) {
  const sections = React.useMemo(() => formSectionsOf(object.fields, viewConfig), [object.fields, viewConfig]);
  const fields = React.useMemo(() => sections.flatMap((s) => s.fields), [sections]);
  const successMode = viewConfig.successMode === "view" ? "view" : "another";
  const submitLabel = typeof viewConfig.submitLabel === "string" && viewConfig.submitLabel
    ? viewConfig.submitLabel
    : `Create ${object.labelOne.toLowerCase()}`;

  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showSummary, setShowSummary] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ id: string; title: string } | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());

  const required = requiredSetOf(object, fields, viewConfig, draft);

  if (!onCreate) {
    return (
      <div className="nxCard nxFormNoCreate" data-testid="form-nocreate">
        Creating {object.label.toLowerCase()} needs the create permission.
        <style>{FORM_CSS}</style>
      </div>
    );
  }

  const setVal = (key: string, v: unknown) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const focusField = (key: string) => {
    const el = rowRefs.current.get(key);
    (el?.querySelector("input, select, textarea, button") as HTMLElement | null)?.focus();
    el?.scrollIntoView({ block: "center" });
  };

  const mapServerError = (message: string) => {
    const hit = fields.find((f) => message.startsWith(f.label));
    if (hit) {
      setErrors((e) => ({ ...e, [hit.key]: message }));
      setShowSummary(true);
      focusField(hit.key);
    } else {
      setFormError(message);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const body = withStageDefault(object, coerceDraft(fields, draft, { richText: textToBlocks, defs: fieldTypeDefinitions }));
    const errs = validateDraft(fields, body, requiredSetOf(object, fields, viewConfig, draft), fieldTypeDefinitions);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setShowSummary(true);
      const first = fields.find((f) => errs[f.key]);
      if (first) focusField(first.key);
      return;
    }
    setShowSummary(false);
    setBusy(true);
    onCreate(body)
      .then((row) => {
        setBusy(false);
        const titleField = fields.find((f) => f.primary) ?? fields[0];
        const title = titleField ? formatCell(row[titleField.key], titleField.type) || row.id : row.id;
        setDraft({});
        setErrors({});
        if (successMode === "view") onOpen(row.id);
        else setCreated({ id: row.id, title });
      })
      .catch((err: Error) => {
        setBusy(false);
        mapServerError(err.message);
      });
  };

  if (created) {
    return (
      <div className="nxCard nxFormCol nxFormSuccess nx-pop-in" data-testid="form-success" role="status">
        <span className="nxFormSuccess-ic" aria-hidden><Check size={18} /></span>
        <span className="nxFormSuccess-title">{created.title} created</span>
        <span className="nxFormSuccess-sub">{object.labelOne} saved. What next?</span>
        <span className="nxFormSuccess-row">
          <Button variant="primary" data-testid="form-again" onClick={() => setCreated(null)}>
            Create another
          </Button>
          <Button data-testid="form-open-created" onClick={() => onOpen(created.id)}>
            View {object.labelOne.toLowerCase()}
          </Button>
        </span>
        <style>{FORM_CSS}</style>
      </div>
    );
  }

  const errorKeys = fields.filter((f) => errors[f.key]).map((f) => f.key);
  return (
    <form className="nxCard nxFormCol" data-testid={`form-${object.key}`} onSubmit={submit} noValidate>
      {showSummary && errorKeys.length > 0 && (
        <div className="nxFormSummary" role="alert" data-testid="form-summary">
          <span>{errorKeys.length} field{errorKeys.length > 1 ? "s" : ""} to fix:</span>
          {errorKeys.map((k) => (
            <button type="button" key={k} className="nxFormSummary-link" data-testid={`form-summary-${k}`} onClick={() => focusField(k)}>
              {fields.find((f) => f.key === k)?.label ?? k}
            </button>
          ))}
        </div>
      )}
      {sections.map((sec, si) => (
        <div key={sec.label ?? si} className="nxFormSection" data-testid={sec.label ? `form-section-${sec.label}` : undefined}>
          {sec.label && <div className="nxFormSection-h">{sec.label}</div>}
          {sec.fields.map((f) => {
            const Draft = fieldDraftEditor(f);
            const err = errors[f.key];
            return (
              <div
                key={f.key}
                className="nxFormRow"
                ref={(el) => { if (el) rowRefs.current.set(f.key, el); else rowRefs.current.delete(f.key); }}
              >
                <label className="nxFormLabel">
                  {f.label}
                  {required.includes(f.key) && <span className="nxFormReq" data-testid={`form-req-${f.key}`} aria-hidden> *</span>}
                </label>
                <Draft field={f} fieldKey={`form-${f.key}`} value={draft[f.key]} onChange={(v) => setVal(f.key, v)} users={users} error={err ?? null} />
                {err && <span className="nxFormErr" data-testid={`form-err-${f.key}`}>{err}</span>}
              </div>
            );
          })}
        </div>
      ))}
      <span aria-live="polite">
        {formError && <span className="nxFormErr" data-testid="form-error">{formError}</span>}
      </span>
      <span className="nxFormActions">
        <Button variant="primary" type="submit" busy={busy} data-testid="form-submit">
          {submitLabel}
        </Button>
      </span>
      <style>{FORM_CSS}</style>
    </form>
  );
}

const FORM_CSS = `
.nxFormCol{display:flex;flex-direction:column;gap:14px;max-width:600px;margin:0 auto;padding:22px 24px 24px}
.nxFormSection{display:flex;flex-direction:column;gap:14px}
.nxFormSection-h{font:600 13px/1 var(--nx-font-sans);color:var(--nx-fg);padding-bottom:2px;
  border-bottom:1px solid var(--nx-border)}
.nxFormRow{display:flex;flex-direction:column;gap:5px}
.nxFormLabel{font:var(--nx-text-meta);font-weight:600;color:var(--nx-fg-muted)}
.nxFormReq{color:var(--nx-danger)}
.nxFormErr{color:var(--nx-danger);font:var(--nx-text-meta)}
.nxFormSummary{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:9px 12px;border-radius:var(--nx-radius-m);
  background:var(--nx-danger-soft,var(--nx-bg-sunken));color:var(--nx-danger);font:var(--nx-text-meta)}
.nxFormSummary-link{background:none;border:0;color:var(--nx-danger);font:inherit;font-weight:600;
  text-decoration:underline;cursor:pointer;padding:0}
.nxFormActions{display:flex;justify-content:flex-end;margin-top:4px}
.nxFormNoCreate{max-width:600px;margin:0 auto;padding:28px;text-align:center;color:var(--nx-fg-muted)}
.nxFormSuccess{align-items:center;text-align:center;gap:8px;padding:36px 24px}
.nxFormSuccess-ic{display:grid;place-items:center;width:36px;height:36px;border-radius:999px;
  background:var(--nx-ok-soft);color:var(--nx-ok)}
.nxFormSuccess-title{font:var(--nx-text-title)}
.nxFormSuccess-sub{color:var(--nx-fg-muted);font:var(--nx-text-meta)}
.nxFormSuccess-row{display:flex;gap:8px;margin-top:8px}
@media (max-width:640px){.nxFormCol{padding:16px 14px 18px}}
`;
