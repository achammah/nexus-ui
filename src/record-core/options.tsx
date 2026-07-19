import * as React from "react";
import type { FieldDef, OptionColor } from "./types";
import { normalizeOption } from "./types";

/* Option chip rendering — ONE place decides how a colored option looks, every
   surface (table cell, kanban badge, filter chip, record page) reuses it. */

export const optionMeta = (field: FieldDef | undefined, value: unknown) => {
  const hit = (field?.options ?? []).map(normalizeOption).find((o) => o.value === String(value ?? ""));
  return hit ?? { value: String(value ?? ""), label: String(value ?? ""), color: undefined as OptionColor | undefined };
};

export const chipStyle = (color?: OptionColor): React.CSSProperties =>
  color
    ? {
        background: `color-mix(in oklab, var(--nx-opt-${color}) 16%, var(--nx-bg-raised))`,
        color: `var(--nx-opt-${color})`,
      }
    : { background: "var(--nx-bg-sunken)", border: "1px solid var(--nx-border)", color: "var(--nx-fg-muted)" };

export function OptionChip({ field, value, testid }: { field?: FieldDef; value: unknown; testid?: string }) {
  const meta = optionMeta(field, value);
  if (!meta.value) return <span>—</span>;
  return (
    <span className="nxOptChip" data-testid={testid} data-color={meta.color ?? "none"} style={chipStyle(meta.color)}>
      {meta.label}
    </span>
  );
}

/* the fields every SURFACE should render — deactivated fields keep their data
   but disappear from tables, record pages, creates, filters, exports */
export const activeFields = (fields: FieldDef[]) => fields.filter((f) => f.isActive !== false);
