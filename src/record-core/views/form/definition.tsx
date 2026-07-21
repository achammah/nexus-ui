import * as React from "react";
import { ClipboardList } from "lucide-react";
import type { ViewDefinition } from "../types";
import { activeFields } from "../../options";

/* Form view — a config-driven fill-one-record surface (the seed of public
   intake forms). Config keys: `fields` (the field keys to render, in order;
   defaults to every supported field in config order — json and many-relations
   are excluded, they attach on the record page) · `requiredOverrides`
   ({key: true|false} over the default primary-only required set) ·
   `submitLabel` · `successMode` ("another" default | "view" opens the created
   record). Submits through ViewProps.onCreate (the host's store create path). */

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
    { key: "requiredOverrides", label: "Required overrides", kind: "text" },
    { key: "submitLabel", label: "Submit label", kind: "text" },
    { key: "successMode", label: "After submit", kind: "select", options: ["another", "view"] },
  ],
  validateConfig: (object, cfg) => {
    const fields = activeFields(object.fields);
    const keys = cfg.fields;
    if (keys !== undefined) {
      if (!Array.isArray(keys)) return "fields must be a list of field keys";
      for (const k of keys as unknown[]) {
        const f = fields.find((x) => x.key === String(k));
        if (!f) return `fields “${String(k)}” is not a field of ${object.key}`;
        if (UNSUPPORTED(f)) return `fields “${String(k)}” (${f.type === "json" ? "json" : "multi-relation"}) is not form-editable — it edits on the record page`;
      }
    }
    const ro = cfg.requiredOverrides;
    if (ro !== undefined) {
      if (typeof ro !== "object" || ro === null || Array.isArray(ro)) return "requiredOverrides must be {fieldKey: true|false}";
      const bad = Object.keys(ro as Record<string, unknown>).find((k) => !fields.some((x) => x.key === k));
      if (bad) return `requiredOverrides “${bad}” is not a field of ${object.key}`;
    }
    if (cfg.successMode !== undefined && cfg.successMode !== "another" && cfg.successMode !== "view")
      return `successMode must be "another" or "view"`;
    return null;
  },
};

export default definition;
