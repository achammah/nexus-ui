// explicit .ts extensions: this pure module is imported by node:test directly
// (extensionless relative specifiers only resolve in the bundler)
import type { FieldDef, ObjectConfig } from "../types.ts";
import type { FieldTypeDefinition } from "./types.ts";
import { isMoneyValue, normalizeOption, optionValues } from "../types.ts";

/* the registry map, passed IN by browser callers (fieldTypeDefinitions) and by
   tests as a fake — this module never touches import.meta.glob itself */
export type FieldDefs = Record<string, FieldTypeDefinition>;

/* Field-editor pure core — draft coercion, required/validation rules, and the
   per-entry list validators every draft surface (create dialog, guided create,
   form view) shares. No React, no JSX: unit-testable under node:test, and the
   client mirror of the server's config-implied validation (server/store.mjs
   validate()) so most errors surface inline before a request is made. The
   server stays the authority; messages here match its wording where shared. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const urlOk = (v: string): boolean =>
  [v, `https://${v}`].some((u) => {
    try {
      new URL(u);
      return u.includes(".");
    } catch {
      return false;
    }
  });

/* per-entry validators for the list types — messages NAME the field */
export const listValidators: Record<string, (label: string) => (entry: string) => string | null> = {
  emails: (label) => (v) => (EMAIL_RE.test(v) ? null : `${label}: "${v}" is not a valid email address`),
  phones: (label) => (v) => (/^[0-9+()\-\s.]{3,}$/.test(v) ? null : `${label}: "${v}" is not a valid phone number`),
  links: (label) => (v) => (urlOk(v) ? null : `${label}: "${v}" is not a valid URL or domain`),
};

/* empty for REQUIRED purposes: blank string, nullish, empty list, or a shaped
   object with no non-empty string part (the create dialog's primary gate). */
export const isEmptyValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return !Object.values(v as Record<string, unknown>).some((x) => String(x ?? "").trim() !== "");
  return false;
};

/* one scalar commit coercion — the single source for "what a typed string means
   for this field type" (DataTable cell commit + RecordPage blur + drafts). */
export const coerceScalar = (type: string, raw: string): unknown =>
  type === "number" || type === "currency" ? Number(raw) : raw;

/* Coerce a whole draft before create. Skips values that mean "unset" (undefined,
   blank strings, empty lists); a registered field type's `coerce` slot runs
   first (custom types plug into the same pipeline), then the built-in rules:
   number/currency strings become numbers — a non-numeric string is kept
   verbatim so the server validator names the field (the import path's
   convention) — and a richText STRING becomes blocks via the injected
   converter (kept injectable so this module stays JSX-free). */
export const coerceDraft = (
  fields: FieldDef[],
  draft: Record<string, unknown>,
  opts: { richText?: (text: string) => unknown; defs?: FieldDefs } = {},
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (v === undefined || (typeof v === "string" && v === "") || (Array.isArray(v) && v.length === 0)) continue;
    const f = fields.find((x) => x.key === k);
    const slot = f && opts.defs?.[f.type]?.coerce;
    if (f && slot) {
      out[k] = slot(v, f);
    } else if (f && (f.type === "number" || f.type === "currency") && typeof v === "string") {
      const n = Number(v);
      out[k] = Number.isNaN(n) ? v : n;
    } else if (f && f.type === "richText" && typeof v === "string") {
      out[k] = opts.richText ? opts.richText(v) : v;
    } else {
      out[k] = v;
    }
  }
  return out;
};

/* Kanban-stage parity for every create surface: an unset stageField defaults to
   the first option VALUE (never the raw option object — colored `{value,color}`
   options must not leak into the row). */
export const withStageDefault = (
  config: Pick<ObjectConfig, "stageField" | "fields">,
  body: Record<string, unknown>,
): Record<string, unknown> => {
  if (!config.stageField || !isEmptyValue(body[config.stageField])) return body;
  const sf = config.fields.find((f) => f.key === config.stageField);
  const first = optionValues(sf?.options)[0];
  return first === undefined ? body : { ...body, [config.stageField]: first };
};

/* the required set for a draft surface: the primary field, adjusted by a
   view's requiredOverrides ({key: true|false}) */
export const requiredKeys = (
  fields: FieldDef[],
  overrides: Record<string, boolean> = {},
): string[] => {
  const primary = fields.find((f) => f.primary) ?? fields[0];
  const keys = new Set<string>(primary ? [primary.key] : []);
  for (const [k, on] of Object.entries(overrides)) {
    if (on) keys.add(k);
    else keys.delete(k);
  }
  return [...keys];
};

/* Validate a coerced draft: required + the config-implied per-type rules.
   Returns {fieldKey: message}; empty object = valid. Only PRESENT values are
   type-checked (matching the server: absent/blank keys pass through). A
   registered type's `validate` slot runs first and its message wins. */
export const validateDraft = (
  fields: FieldDef[],
  draft: Record<string, unknown>,
  required: string[] = [],
  defs?: FieldDefs,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const key of required) {
    const f = fields.find((x) => x.key === key);
    if (f && isEmptyValue(draft[key])) errors[key] = `${f.label} is required`;
  }
  for (const [k, v] of Object.entries(draft)) {
    if (errors[k] || v === null || v === undefined || v === "") continue;
    const f = fields.find((x) => x.key === k);
    if (!f) continue;
    const slot = defs?.[f.type]?.validate;
    if (slot) {
      const msg = slot(v, f);
      if (msg) errors[k] = msg;
      continue;
    }
    if (f.type === "email" && !EMAIL_RE.test(String(v))) errors[k] = `${f.label} must be a valid email address`;
    if (f.type === "url" && !urlOk(String(v))) errors[k] = `${f.label} must be a valid URL or domain`;
    if ((f.type === "number" || f.type === "currency") && (typeof v !== "number" || Number.isNaN(v)))
      errors[k] = `${f.label} must be a number`;
    if ((f.type === "date" || f.type === "dateTime") && Number.isNaN(new Date(String(v)).getTime()))
      errors[k] = `${f.label} must be a valid date`;
    if (f.type === "rating") {
      const scale = f.scale ?? 5;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > scale)
        errors[k] = `${f.label} must be a whole number between 0 and ${scale}`;
    }
    if (f.type === "select" && f.options && !optionValues(f.options).includes(String(v)))
      errors[k] = `${f.label} must be one of: ${optionValues(f.options).join(", ")}`;
    if (f.type === "multiselect" && Array.isArray(v) && f.options) {
      const allowed = optionValues(f.options);
      const bad = v.map(String).find((x) => !allowed.includes(x));
      if (bad !== undefined) errors[k] = `${f.label} must be one of: ${allowed.join(", ")}`;
    }
    if (f.type === "money" && !isMoneyValue(v)) errors[k] = `${f.label} must have a numeric amount`;
    if (f.type === "money" && isMoneyValue(v) && v.code && !/^[A-Za-z]{3}$/.test(v.code))
      errors[k] = `${f.label} code must be a 3-letter currency code`;
    if ((f.type === "emails" || f.type === "phones" || f.type === "links") && Array.isArray(v)) {
      const check = listValidators[f.type](f.label);
      for (const entry of v) {
        const err = check(String(entry));
        if (err) { errors[k] = err; break; }
      }
    }
  }
  return errors;
};

/* option labels for a draft select — one place so every surface renders the
   configured label (a bare string option labels as itself) */
export const selectOptionsFor = (f: FieldDef): { value: string; label: string }[] =>
  (f.options ?? []).map((o) => {
    const n = normalizeOption(o);
    return { value: n.value, label: n.label };
  });

/* which fields a form surface can author: a type is form-editable when its
   registry entry fills `Draft` (every built-in registers one; json does not),
   except many-relations (they attach on the record page, as the create dialog
   already establishes) and deactivated fields */
export const formSupported = (f: FieldDef, defs: FieldDefs): boolean =>
  !!defs[f.type]?.Draft && !(f.type === "relation" && f.multiple) && f.isActive !== false;
