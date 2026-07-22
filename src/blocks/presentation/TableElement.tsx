import * as React from "react";
import type { SlideElement, TableSpec } from "./types";

/* A slide table. Plain DOM (no library): a table is a grid of styled text, and
   the element already owns its box, so a <table> laid out at 100%/100% inside it
   renders identically in the filmstrip, canvas, present mode and PDF export.
   Colours come from the deck theme so a table re-skins with the deck. */

export interface TableRenderProps {
  el: SlideElement;
  editable?: boolean;
  /* fires per cell edit (text only — structure changes come from the toolbar) */
  onCell?: (r: number, c: number, text: string) => void;
}

export function TableRender({ el, editable, onCell }: TableRenderProps) {
  const spec = el.table;
  if (!spec) return null;
  const header = spec.headerRow !== false;
  const widths = spec.colWidths?.length === (spec.rows[0]?.length ?? 0) ? spec.colWidths : undefined;
  const fontSize = el.style?.fontSize ?? 20;

  return (
    <table className="nxPresTable" style={{ fontSize }}>
      {widths && (
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: `${(w / widths.reduce((a, b) => a + b, 0)) * 100}%` }} />
          ))}
        </colgroup>
      )}
      <tbody>
        {spec.rows.map((row, r) => (
          <tr key={r} className={header && r === 0 ? "isHeader" : undefined}>
            {row.map((cell, c) => {
              const Tag = (header && r === 0 ? "th" : "td") as "th" | "td";
              return (
                <Tag
                  key={c}
                  style={{
                    textAlign: cell.align ?? (header && r === 0 ? "left" : undefined),
                    fontWeight: cell.bold || (header && r === 0) ? 700 : undefined,
                    background: cell.bg,
                  }}
                  contentEditable={editable}
                  suppressContentEditableWarning
                  onBlur={editable ? (e) => onCell?.(r, c, e.currentTarget.textContent ?? "") : undefined}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {cell.text}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---- structural ops (pure) ---- */

export const emptyCell = () => ({ text: "" });

export function addRow(spec: TableSpec, at?: number): TableSpec {
  const cols = spec.rows[0]?.length ?? 3;
  const row = Array.from({ length: cols }, emptyCell);
  const rows = spec.rows.slice();
  rows.splice(at ?? rows.length, 0, row);
  return { ...spec, rows };
}

export function addColumn(spec: TableSpec, at?: number): TableSpec {
  const rows = spec.rows.map((r) => {
    const next = r.slice();
    next.splice(at ?? next.length, 0, emptyCell());
    return next;
  });
  const colWidths = spec.colWidths ? [...spec.colWidths, 1] : undefined;
  return { ...spec, rows, colWidths };
}

export function removeRow(spec: TableSpec, at: number): TableSpec {
  if (spec.rows.length <= 1) return spec;
  return { ...spec, rows: spec.rows.filter((_, i) => i !== at) };
}

export function removeColumn(spec: TableSpec, at: number): TableSpec {
  if ((spec.rows[0]?.length ?? 0) <= 1) return spec;
  return {
    ...spec,
    rows: spec.rows.map((r) => r.filter((_, i) => i !== at)),
    colWidths: spec.colWidths?.filter((_, i) => i !== at),
  };
}

export function setCell(spec: TableSpec, r: number, c: number, text: string): TableSpec {
  return {
    ...spec,
    rows: spec.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? { ...cell, text } : cell)) : row)),
  };
}

export default TableRender;
