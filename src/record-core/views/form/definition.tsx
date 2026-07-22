import * as React from "react";
import { ClipboardList } from "lucide-react";
import type { ViewDefinition } from "../types";
import { activeFields } from "../../options";

/* Form view — a config-driven fill-one-record surface (the seed of public
   intake forms). Config keys: `fields` (the field keys to render, in order) ·
   `sections` ([{label, fields[]}] — labeled field groups; supersedes `fields`) ·
   `requiredOverrides` ({key: true|false} over the default primary-only set) ·
   `requiredWhen` ({key: {field, equals}} — a field becomes required when the
   trigger field equals a value) · `submitLabel` · `successMode` ("another"
   default | "view"). json and many-relations edit on the record page, never
   the form. Submits through ViewProps.onCreate (the host's store create path). */

const FormView = React.lazy(() => import("./FormView"));

const UNSUPPORTED = (f: { type: string; multiple?: boolean }) =>
  f.type === "json" || (f.type === "relation" && f.multiple);

const definition: ViewDefinition = {
  type: "form",
  label: "Form",
  icon: <ClipboardList size={13} />,
  component: FormView,
  configSchema: [
    { key: "fields", label: "Fields", kind: "text" },
    { key: "sections", label: "Sections", kind: "text" },
    { key: "requiredOverrides", label: "Required overrides", kind: "text" },
    { key: "requiredWhen", label: "Conditional required", kind: "text" },
    { key: "submitLabel", label: "Submit label", kind: "text" },
    { key: "successMode", label: "After submit", kind: "select", options: ["another", "view"] },
  ],
  validateConfig: (object, cfg) => {
    const fields = activeFields(object.fields);
    const badFieldKey = (k: unknown): string | null => {
      const f = fields.find((x) => x.key === String(k));
      if (!f) return `“${String(k)}” is not a field of ${object.key}`;
      if (UNSUPPORTED(f)) return `“${String(k)}” (${f.type === "json" ? "json" : "multi-relation"}) is not form-editable — it edits on the record page`;
      return null;
    };
    const checkKeyList = (keys: unknown[]): string | null => {
      for (const k of keys) {
        const bad = badFieldKey(k);
        if (bad) return bad;
      }
      return null;
    };

    const keys = cfg.fields;
    if (keys !== undefined) {
      if (!Array.isArray(keys)) return "fields must be a list of field keys";
      const bad = checkKeyList(keys as unknown[]);
      if (bad) return `fields ${bad}`;
    }

    const secs = cfg.sections;
    if (secs !== undefined) {
      if (!Array.isArray(secs)) return "sections must be a list of {label, fields}";
      for (const s of secs as unknown[]) {
        if (typeof s !== "object" || s === null || Array.isArray(s)) return "each section must be an object {label, fields}";
        const so = s as Record<string, unknown>;
        if (so.label !== undefined && typeof so.label !== "string") return "section label must be text";
        if (so.fields !== undefined) {
          if (!Array.isArray(so.fields)) return "section fields must be a list of field keys";
          const bad = checkKeyList(so.fields as unknown[]);
          if (bad) return `sections ${bad}`;
        }
      }
    }

    const ro = cfg.requiredOverrides;
    if (ro !== undefined) {
      if (typeof ro !== "object" || ro === null || Array.isArray(ro)) return "requiredOverrides must be {fieldKey: true|false}";
      const bad = Object.keys(ro as Record<string, unknown>).find((k) => !fields.some((x) => x.key === k));
      if (bad) return `requiredOverrides “${bad}” is not a field of ${object.key}`;
    }

    const rw = cfg.requiredWhen;
    if (rw !== undefined) {
      if (typeof rw !== "object" || rw === null || Array.isArray(rw)) return "requiredWhen must be {fieldKey: {field, equals}}";
      for (const [k, cond] of Object.entries(rw as Record<string, unknown>)) {
        if (!fields.some((x) => x.key === k)) return `requiredWhen “${k}” is not a field of ${object.key}`;
        if (typeof cond !== "object" || cond === null || Array.isArray(cond) || !("field" in cond) || !("equals" in cond))
          return `requiredWhen “${k}” must be {field, equals}`;
        const trig = (cond as Record<string, unknown>).field;
        if (!fields.some((x) => x.key === String(trig))) return `requiredWhen “${k}” trigger field “${String(trig)}” is not a field of ${object.key}`;
      }
    }

    if (cfg.successMode !== undefined && cfg.successMode !== "another" && cfg.successMode !== "view")
      return `successMode must be "another" or "view"`;
    return null;
  },
};

export default definition;
