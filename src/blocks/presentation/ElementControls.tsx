import * as React from "react";
import type { ChartKind, ShapeKind, Slide, SlideElement, TableSpec } from "./types";
import {
  alignElements,
  distributeElements,
  els,
  groupElements,
  reorder,
  ungroupElements,
  updateElement,
  updateStyle,
  type AlignOp,
  type ZOp,
} from "./elements";
import { SHAPE_LABELS, ShapeGlyph } from "./ShapeRender";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Button } from "../../primitives/Button";
import { IconAction, PickerMenu } from "./chrome";
import {
  AlignCenter,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignVerticalDistributeCenter,
  ChartNoAxesColumn,
  Columns3,
  Group,
  Image as ImageIcon,
  MoveDown,
  MoveUp,
  Plus,
  Rows3,
  SendToBack,
  Table2,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react";
import { addColumn, addRow, removeColumn, removeRow } from "./TableElement";

const SHAPES: ShapeKind[] = ["rect", "roundRect", "ellipse", "triangle", "arrow", "line", "star", "callout"];

/* ---- insert ----
   One menu button in the app's dropdown grammar, rather than a row of bespoke
   buttons plus a hand-rolled popover. */

export function InsertMenu({
  onInsertShape,
  onInsertText,
  onInsertImage,
  onInsertChart,
  onInsertTable,
}: {
  onInsertShape: (s: ShapeKind) => void;
  onInsertText: () => void;
  onInsertImage: () => void;
  onInsertChart: (t: ChartKind) => void;
  onInsertTable: () => void;
}) {
  /* the shape GRID is plain buttons rather than menu rows (it is a palette), so
     the menu is controlled and closes explicitly on pick */
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" icon={<Plus size={13} />} data-testid="insert-menu">
          Insert
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Insert</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={false} onCheckedChange={onInsertText} data-testid="insert-text">
          <span className="nxPresMenuIcon"><Type size={13} /></span>
          Text box
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={false} onCheckedChange={onInsertImage} data-testid="insert-image">
          <span className="nxPresMenuIcon"><ImageIcon size={13} /></span>
          Image
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => onInsertChart("bar")} data-testid="insert-chart">
          <span className="nxPresMenuIcon"><ChartNoAxesColumn size={13} /></span>
          Chart
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={false} onCheckedChange={onInsertTable} data-testid="insert-table">
          <span className="nxPresMenuIcon"><Table2 size={13} /></span>
          Table
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Shape</DropdownMenuLabel>
        <div className="nxPresShapeGrid">
          {SHAPES.map((k) => (
            <button
              key={k}
              type="button"
              className="nxPresShapeCell"
              onClick={() => {
                onInsertShape(k);
                setOpen(false);
              }}
              aria-label={SHAPE_LABELS[k]}
              title={SHAPE_LABELS[k]}
              data-testid={`insert-shape-${k}`}
            >
              <ShapeGlyph shape={k} />
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---- selected-element properties ---- */

const SWATCHES = [
  "var(--pres-accent)",
  "var(--pres-fg)",
  "#ffffff",
  "#0f172a",
  "#e5484d",
  "#f5a524",
  "#30a46c",
  "#3b82f6",
  "none",
];

export function ElementBar({
  slide,
  selected,
  onSlide,
  onSelect,
}: {
  slide: Slide;
  selected: string[];
  onSlide: (s: Slide) => void;
  onSelect: (ids: string[]) => void;
}) {
  const list = els(slide);
  const [dataOpen, setDataOpen] = React.useState(false);
  const sel = list.filter((e) => selected.includes(e.id));
  if (!sel.length) return null;
  const first: SlideElement = sel[0];
  const st = first.style ?? {};
  const many = sel.length > 1;
  const grouped = sel.some((e) => e.groupId);
  const hasShape = sel.some((e) => e.kind === "shape");
  const hasText = sel.some((e) => e.kind === "text" || e.kind === "shape");

  const style = (patch: Parameters<typeof updateStyle>[2]) => onSlide(updateStyle(slide, selected, patch));
  const z = (op: ZOp) => onSlide(reorder(slide, selected, op));
  const align = (op: AlignOp) => onSlide(alignElements(slide, selected, op));

  return (
    <div className="nxPresElBar" role="toolbar" aria-label="Element properties" data-testid="element-bar">
      <span className="nxPresElBarCount">{many ? `${sel.length} selected` : labelOf(first)}</span>

      {(hasShape || first.kind === "text") && (
        <ColorWell
          label="Fill"
          value={st.fill ?? "none"}
          onPick={(v) => style({ fill: v })}
          testid="fill-well"
        />
      )}
      {hasShape && (
        <ColorWell label="Line" value={st.stroke ?? "none"} onPick={(v) => style({ stroke: v })} testid="stroke-well" />
      )}
      {hasText && <ColorWell label="Text" value={st.color ?? "var(--pres-fg)"} onPick={(v) => style({ color: v })} testid="color-well" />}

      {hasShape && (
        <label className="nxPresToolLabel">
          Line w
          <input
            className="nxPresNum"
            type="number"
            min={0}
            max={40}
            value={st.strokeWidth ?? 0}
            onChange={(e) => style({ strokeWidth: Number(e.target.value) })}
            aria-label="Line width"
          />
        </label>
      )}
      <label className="nxPresToolLabel">
        {hasShape ? "Fill α" : "Opacity"}
        <input
          className="nxPresRange"
          type="range"
          min={0}
          max={100}
          value={Math.round((hasShape ? st.fillOpacity ?? 1 : st.opacity ?? 1) * 100)}
          onChange={(e) =>
            style(hasShape ? { fillOpacity: Number(e.target.value) / 100 } : { opacity: Number(e.target.value) / 100 })
          }
          aria-label={hasShape ? "Fill opacity" : "Opacity"}
          data-testid="opacity-range"
        />
      </label>
      {(first.shape === "roundRect" || first.kind === "image") && (
        <label className="nxPresToolLabel">
          Radius
          <input
            className="nxPresNum"
            type="number"
            min={0}
            max={200}
            value={st.radius ?? 0}
            onChange={(e) => style({ radius: Number(e.target.value) })}
            aria-label="Corner radius"
          />
        </label>
      )}
      {hasText && (
        <label className="nxPresToolLabel">
          Size
          <input
            className="nxPresNum"
            type="number"
            min={8}
            max={200}
            value={st.fontSize ?? 24}
            onChange={(e) => style({ fontSize: Number(e.target.value) })}
            aria-label="Font size"
          />
        </label>
      )}

      {first.kind === "chart" && first.chart && (
        <>
          <PickerMenu
            value={first.chart.type}
            options={(["bar", "line", "area", "pie", "scatter"] as ChartKind[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
            onPick={(t) => onSlide(updateElement(slide, first.id, { chart: { ...first.chart!, type: t } }))}
            label="Chart type"
            icon={<ChartNoAxesColumn size={13} />}
            testid="chart-type"
            align="end"
          />
          <Button
            size="sm"
            variant={dataOpen ? "secondary" : "ghost"}
            onClick={() => setDataOpen((v) => !v)}
            aria-expanded={dataOpen}
            data-testid="chart-data-btn"
          >
            Edit data
          </Button>
        </>
      )}

      {first.kind === "table" && first.table && (
        <>
          <IconAction icon={<Rows3 size={13} />} label="Add row" onClick={() => onSlide(updateElement(slide, first.id, { table: addRow(first.table as TableSpec) }))} testid="table-add-row" />
          <IconAction icon={<Columns3 size={13} />} label="Add column" onClick={() => onSlide(updateElement(slide, first.id, { table: addColumn(first.table as TableSpec) }))} testid="table-add-col" />
          <IconAction icon={<Rows3 size={13} />} label="Remove row" onClick={() => onSlide(updateElement(slide, first.id, { table: removeRow(first.table as TableSpec, first.table!.rows.length - 1) }))} testid="table-del-row" />
          <IconAction icon={<Columns3 size={13} />} label="Remove column" onClick={() => onSlide(updateElement(slide, first.id, { table: removeColumn(first.table as TableSpec, (first.table!.rows[0]?.length ?? 1) - 1) }))} testid="table-del-col" />
          <IconAction
            icon={<Table2 size={13} />}
            label="Header row"
            active={first.table.headerRow !== false}
            onClick={() => onSlide(updateElement(slide, first.id, { table: { ...first.table!, headerRow: first.table!.headerRow === false } }))}
            testid="table-header-toggle"
          />
        </>
      )}

      <span className="nxPresTopDivide" />
      <IconAction icon={<MoveUp size={13} />} label="Bring to front" onClick={() => z("front")} testid="z-front" />
      <IconAction icon={<MoveDown size={13} />} label="Send to back" onClick={() => z("back")} testid="z-back" />
      <PickerMenu
        value={"none" as string}
        options={[
          { value: "forward", label: "Bring forward" },
          { value: "backward", label: "Send backward" },
        ]}
        onPick={(v) => z(v as ZOp)}
        label="Order"
        icon={<SendToBack size={13} />}
        showValue={false}
        testid="z-more"
        align="end"
      />

      <span className="nxPresTopDivide" />
      <IconAction icon={<AlignLeft size={13} />} label="Align left" onClick={() => align("left")} testid="align-left" />
      <IconAction icon={<AlignCenter size={13} />} label="Align centre" onClick={() => align("hcenter")} testid="align-hcenter" />
      <IconAction icon={<AlignRight size={13} />} label="Align right" onClick={() => align("right")} testid="align-right" />
      <IconAction icon={<AlignStartHorizontal size={13} />} label="Align top" onClick={() => align("top")} testid="align-top" />
      <IconAction icon={<AlignEndHorizontal size={13} />} label="Align bottom" onClick={() => align("bottom")} testid="align-bottom" />
      {sel.length > 2 && (
        <>
          <IconAction icon={<AlignHorizontalDistributeCenter size={13} />} label="Distribute horizontally" onClick={() => onSlide(distributeElements(slide, selected, "h"))} testid="dist-h" />
          <IconAction icon={<AlignVerticalDistributeCenter size={13} />} label="Distribute vertically" onClick={() => onSlide(distributeElements(slide, selected, "v"))} testid="dist-v" />
        </>
      )}

      {(many || grouped) && (
        <>
          <span className="nxPresTopDivide" />
          {grouped ? (
            <IconAction icon={<Ungroup size={13} />} label="Ungroup" onClick={() => onSlide(ungroupElements(slide, selected))} testid="ungroup-btn" />
          ) : (
            <IconAction icon={<Group size={13} />} label="Group" onClick={() => onSlide(groupElements(slide, selected))} testid="group-btn" />
          )}
        </>
      )}

      {dataOpen && first.kind === "chart" && first.chart && (
        <ChartDataGrid
          spec={first.chart}
          onChange={(next) => onSlide(updateElement(slide, first.id, { chart: next }))}
        />
      )}

      <span className="nxPresTopDivide" />
      <IconAction
        icon={<Trash2 size={13} />}
        label="Delete element"
        shortcut="⌫"
        onClick={() => {
          onSlide({ ...slide, elements: list.filter((e) => !selected.includes(e.id)) });
          onSelect([]);
        }}
        testid="el-delete"
      />
    </div>
  );
}

const labelOf = (e: SlideElement): string =>
  e.kind === "shape" ? SHAPE_LABELS[e.shape ?? "rect"] : e.kind === "image" ? "Image" : "Text box";

/* Colour picker on the app's dropdown grammar (was a hand-rolled popover). */
function ColorWell({
  label,
  value,
  onPick,
  testid,
}: {
  label: string;
  value: string;
  onPick: (v: string) => void;
  testid?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`${label} colour`} data-testid={testid}>
          <span className={`nxPresColorChip${value === "none" ? " isNone" : ""}`} style={{ background: value === "none" ? undefined : value }} />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <div className="nxPresSwatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={`nxPresSwatch${c === "none" ? " isNone" : ""}${c === value ? " isActive" : ""}`}
              style={{ background: c === "none" ? undefined : c }}
              aria-label={c === "none" ? "No colour" : c}
              data-testid={`swatch-${c.replace(/[^a-z0-9]/gi, "")}`}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---- chart data table ----
   The numbers behind a chart are editable in place: add/remove rows (categories)
   and series (columns), rename either, and type values. Every edit is a history
   step, so ⌘Z walks back through data changes like any other edit. */
function ChartDataGrid({ spec, onChange }: { spec: import("./types").ChartSpec; onChange: (s: import("./types").ChartSpec) => void }) {
  const setSeries = (i: number, name: string) =>
    onChange({ ...spec, series: spec.series.map((s, x) => (x === i ? name : s)) });
  const setLabel = (r: number, label: string) =>
    onChange({ ...spec, rows: spec.rows.map((row, x) => (x === r ? { ...row, label } : row)) });
  const setValue = (r: number, c: number, v: string) =>
    onChange({
      ...spec,
      rows: spec.rows.map((row, x) =>
        x === r ? { ...row, values: row.values.map((val, y) => (y === c ? Number(v) || 0 : val)) } : row,
      ),
    });

  return (
    <div className="nxPresDataGrid" data-testid="chart-data-grid">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            {spec.series.map((s, i) => (
              <th key={i}>
                <input value={s} onChange={(e) => setSeries(i, e.target.value)} aria-label={`Series ${i + 1} name`} data-testid={`series-name-${i}`} />
              </th>
            ))}
            <th>
              <button
                type="button"
                className="nxPresToolBtn"
                data-testid="chart-add-series"
                onClick={() =>
                  onChange({
                    ...spec,
                    series: [...spec.series, `Series ${spec.series.length + 1}`],
                    rows: spec.rows.map((r) => ({ ...r, values: [...r.values, 0] })),
                  })
                }
              >
                + Series
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row, r) => (
            <tr key={r}>
              <td>
                <input value={row.label} onChange={(e) => setLabel(r, e.target.value)} aria-label={`Category ${r + 1}`} data-testid={`cat-${r}`} />
              </td>
              {row.values.map((v, c) => (
                <td key={c}>
                  <input
                    type="number"
                    value={v}
                    onChange={(e) => setValue(r, c, e.target.value)}
                    aria-label={`${spec.series[c] ?? "value"} for ${row.label}`}
                    data-testid={`val-${r}-${c}`}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="nxPresToolBtn"
                  aria-label={`Remove ${row.label}`}
                  onClick={() => onChange({ ...spec, rows: spec.rows.filter((_, x) => x !== r) })}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="nxPresToolBtn"
        data-testid="chart-add-row"
        onClick={() =>
          onChange({
            ...spec,
            rows: [...spec.rows, { label: `Item ${spec.rows.length + 1}`, values: spec.series.map(() => 0) }],
          })
        }
      >
        + Category
      </button>
    </div>
  );
}
