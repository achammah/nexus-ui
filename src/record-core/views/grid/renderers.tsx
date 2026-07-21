import * as React from "react";
import { GridCellKind, type CustomCell, type CustomRenderer } from "@glideapps/glide-data-grid";
import type { SelectOption } from "../../types";
import { normalizeOption } from "../../types";
import { chipStyle } from "../../options";
import type { ChipColors } from "./theme";

/* Custom canvas cells for the field types glide has no native kind for:
   select (one colored chip) · multiselect (chip row + overflow) · user
   (initials avatar + name). Canvas draws use pre-resolved LITERALS carried in
   the cell data (theme.ts computes them from the same chipStyle formula the
   DOM chips use); the DOM overlay EDITORS render ordinary chipStyle spans, so
   both surfaces share one color source. */

export interface ChipDatum { label: string; bg: string; fg: string }

export interface SelectCellData {
  readonly kind: "nx-select";
  readonly value: string;
  readonly chip: ChipDatum | null;
  readonly options: SelectOption[];
}
export interface MultiselectCellData {
  readonly kind: "nx-multiselect";
  readonly values: string[];
  readonly chips: ChipDatum[];
  readonly options: SelectOption[];
}
export interface UserCellData {
  readonly kind: "nx-user";
  readonly value: string;
  readonly users: string[];
  readonly avatar: ChipColors;
}

export type SelectCell = CustomCell<SelectCellData>;
export type MultiselectCell = CustomCell<MultiselectCellData>;
export type UserCell = CustomCell<UserCellData>;

const CHIP_H = 18;
const CHIP_PAD = 8;
const CHIP_GAP = 4;

const drawChip = (ctx: CanvasRenderingContext2D, x: number, y: number, chip: ChipDatum): number => {
  const w = Math.ceil(ctx.measureText(chip.label).width) + CHIP_PAD * 2;
  ctx.fillStyle = chip.bg;
  ctx.beginPath();
  ctx.roundRect(x, y - CHIP_H / 2, w, CHIP_H, CHIP_H / 2);
  ctx.fill();
  ctx.fillStyle = chip.fg;
  ctx.fillText(chip.label, x + CHIP_PAD, y + 0.5);
  return w;
};

/* shared editor chrome: a small listbox the overlay positions over the cell */
const editorList: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2, padding: 6, minWidth: 160,
  maxHeight: 260, overflowY: "auto",
};
const editorItem = (active: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer",
  borderRadius: "var(--nx-radius-s)", border: 0, background: active ? "var(--nx-accent-soft)" : "none",
  color: "var(--nx-fg)", font: "var(--nx-text-meta)", textAlign: "left",
});
const chipSpan = (o: { label: string; color?: Parameters<typeof chipStyle>[0] }) => (
  <span className="nxOptChip" style={chipStyle(o.color)}>{o.label}</span>
);

export const selectRenderer: CustomRenderer<SelectCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is SelectCell => (c.data as SelectCellData).kind === "nx-select",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { chip } = cell.data;
    if (!chip) return;
    drawChip(ctx, rect.x + theme.cellHorizontalPadding, rect.y + rect.height / 2, chip);
  },
  provideEditor: () => ({
    editor: (p) => {
      const d = p.value.data;
      const opts = d.options.map(normalizeOption);
      return (
        <div style={editorList} data-testid="grid-select-editor">
          {opts.map((o) => (
            <button
              key={o.value}
              type="button"
              style={editorItem(o.value === d.value)}
              data-testid={`grid-select-${o.value.replaceAll(/\W+/g, "-").toLowerCase()}`}
              onClick={() => {
                const next: SelectCell = {
                  ...p.value,
                  copyData: o.value,
                  data: { ...d, value: o.value },
                };
                p.onFinishedEditing(next);
              }}
            >
              {chipSpan(o)}
            </button>
          ))}
        </div>
      );
    },
    disablePadding: true,
  }),
};

export const multiselectRenderer: CustomRenderer<MultiselectCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is MultiselectCell => (c.data as MultiselectCellData).kind === "nx-multiselect",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    let x = rect.x + theme.cellHorizontalPadding;
    const y = rect.y + rect.height / 2;
    const maxX = rect.x + rect.width - theme.cellHorizontalPadding;
    const { chips } = cell.data;
    for (let i = 0; i < chips.length; i++) {
      const w = Math.ceil(ctx.measureText(chips[i].label).width) + CHIP_PAD * 2;
      if (x + w > maxX && i > 0) {
        ctx.fillStyle = args.theme.textLight;
        ctx.fillText(`+${chips.length - i}`, x, y + 0.5);
        return;
      }
      drawChip(ctx, x, y, chips[i]);
      x += w + CHIP_GAP;
    }
  },
  provideEditor: () => ({
    editor: (p) => {
      const d = p.value.data;
      const opts = d.options.map(normalizeOption);
      // toggles stay local while open; the overlay commits ONE change on close
      // (the many-relation one-commit precedent)
      const toggle = (v: string) => {
        const values = d.values.includes(v) ? d.values.filter((x) => x !== v) : [...d.values, v];
        const next: MultiselectCell = {
          ...p.value,
          copyData: values.join("; "),
          data: { ...d, values },
        };
        p.onChange(next);
      };
      return (
        <div style={editorList} data-testid="grid-multiselect-editor">
          {opts.map((o) => (
            <button
              key={o.value}
              type="button"
              style={editorItem(d.values.includes(o.value))}
              data-testid={`grid-multi-${o.value.replaceAll(/\W+/g, "-").toLowerCase()}`}
              onClick={() => toggle(o.value)}
            >
              <span style={{ width: 14, textAlign: "center" }}>{d.values.includes(o.value) ? "✓" : ""}</span>
              {chipSpan(o)}
            </button>
          ))}
        </div>
      );
    },
    disablePadding: true,
  }),
};

export const userRenderer: CustomRenderer<UserCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is UserCell => (c.data as UserCellData).kind === "nx-user",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value, avatar } = cell.data;
    if (!value) return;
    const x = rect.x + theme.cellHorizontalPadding;
    const y = rect.y + rect.height / 2;
    const r = 9;
    ctx.fillStyle = avatar.bg;
    ctx.beginPath();
    ctx.arc(x + r, y, r, 0, Math.PI * 2);
    ctx.fill();
    const initials = value.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    const prevFont = ctx.font;
    ctx.font = `700 9px ${theme.fontFamily}`;
    ctx.fillStyle = avatar.fg;
    const iw = ctx.measureText(initials).width;
    ctx.fillText(initials, x + r - iw / 2, y + 0.5);
    ctx.font = prevFont;
    ctx.fillStyle = theme.textDark;
    ctx.fillText(value, x + r * 2 + 6, y + 0.5);
  },
  provideEditor: () => ({
    editor: (p) => {
      const d = p.value.data;
      return (
        <div style={editorList} data-testid="grid-user-editor">
          {d.users.map((u) => (
            <button
              key={u}
              type="button"
              style={editorItem(u === d.value)}
              data-testid={`grid-user-${u.replaceAll(/\W+/g, "-").toLowerCase()}`}
              onClick={() => {
                const next: UserCell = { ...p.value, copyData: u, data: { ...d, value: u } };
                p.onFinishedEditing(next);
              }}
            >
              {u}
            </button>
          ))}
        </div>
      );
    },
    disablePadding: true,
  }),
};

export const gridRenderers = [selectRenderer, multiselectRenderer, userRenderer];
