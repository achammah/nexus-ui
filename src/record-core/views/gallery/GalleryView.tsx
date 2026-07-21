import * as React from "react";
import type { FieldDef, ObjectConfig, RecordRow } from "../../types";
import type { ViewProps } from "../types";
import { formatCell } from "../../DataTable";
import { OptionChip, activeFields } from "../../options";
import { cardHeight, columnCountForWidth, columnWidthFor, packColumns, visibleIndices } from "./pack";

/* Gallery view — a cover-image card grid packed into masonry columns (see
   ./pack.ts). Cards are real links (cmd/ctrl-click opens a genuine tab, like
   the table's primary cell); click/Enter opens the record peek. Rendering is
   windowed: only cards near the viewport mount, so a 10k-row object scrolls
   smoothly. Card heights are exact by construction (fixed-aspect cover,
   fixed title box), never measured. */

const MIN_COL: Record<string, number> = { s: 200, m: 260, l: 340 };
const GAP = 12;
const OVERSCAN = 600;

export const galleryConfigOf = (object: ObjectConfig, viewConfig: Record<string, unknown>) => {
  const fields = activeFields(object.fields);
  const primary = fields.find((f) => f.primary) ?? fields[0];
  const coverField =
    typeof viewConfig.coverField === "string" && viewConfig.coverField !== ""
      ? fields.find((f) => f.key === viewConfig.coverField)
      : undefined;
  const titleField =
    (typeof viewConfig.titleField === "string" ? fields.find((f) => f.key === viewConfig.titleField) : undefined) ?? primary;
  const metaKeys = Array.isArray(viewConfig.metaFields) ? (viewConfig.metaFields as string[]) : [];
  const metaFields = metaKeys.map((k) => fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f);
  const size = typeof viewConfig.cardSize === "string" && viewConfig.cardSize in MIN_COL ? (viewConfig.cardSize as string) : "m";
  return { coverField, titleField, metaFields, minCol: MIN_COL[size] };
};

const initialsOf = (title: string): string =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

const coverUrlOf = (row: RecordRow, coverField?: FieldDef): string => {
  if (!coverField) return "";
  const v = String(row[coverField.key] ?? "").trim();
  if (!v) return "";
  return /^(https?:|data:)/i.test(v) ? v : `https://${v}`;
};

/* one card — title + meta shaped like the shared record-card contract
   ({object, row, fields, onOpen}) so a library-wide RecordCard can slot in */
function GalleryCard({
  object,
  row,
  titleField,
  metaFields,
  coverField,
  colWidth,
  x,
  y,
  height,
  entranceIndex,
  onOpen,
}: {
  object: ObjectConfig;
  row: RecordRow;
  titleField: FieldDef;
  metaFields: FieldDef[];
  coverField?: FieldDef;
  colWidth: number;
  x: number;
  y: number;
  height: number;
  /* ≥0 → staggered entrance on the initial paint; -1 → appear in place */
  entranceIndex: number;
  onOpen: (id: string) => void;
}) {
  const [broken, setBroken] = React.useState(false);
  const title = formatCell(row[titleField.key], titleField.type) || "—";
  const url = coverUrlOf(row, coverField);
  const showImg = !!url && !broken;
  // height follows what the PACKER assumed (a url present = cover-sized), so a
  // broken image degrades to a placeholder at the same size — positions hold
  const coverH = coverField ? Math.round(colWidth * (url ? 0.75 : 0.42)) : 0;
  const metaVals = metaFields
    .map((f) => ({ f, v: row[f.key] }))
    .filter(({ f, v }) => formatCell(v, f.type) !== "" && v !== null && v !== undefined);
  return (
    <a
      href={`#/o/${object.key}/r/${row.id}`}
      className={`nxGCard nx-hover-lift${entranceIndex >= 0 ? " nx-rise-in-sm" : ""}`}
      style={{
        width: colWidth,
        height,
        // position via the CSS `translate` property (NOT `transform`): the
        // entrance (nxRiseIn) and hover-lift animate `transform`, so sharing it
        // for layout would let the animation's `transform:none` collapse every
        // windowed card to (0,0). `translate` composes under `transform`, so
        // position holds through the entrance stagger and the hover lift.
        translate: `${x}px ${y}px`,
        ...(entranceIndex >= 0 ? ({ "--i": Math.min(entranceIndex, 8) } as React.CSSProperties) : {}),
      }}
      data-testid={`gcard-${row.id}`}
      aria-label={title}
      onClick={(e) => {
        // real link: cmd/ctrl-click opens a genuine new tab (full page)
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        onOpen(row.id);
      }}
    >
      {coverField && (
        showImg ? (
          <img
            className="nxGCard-cover"
            style={{ height: coverH }}
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            data-testid={`gcard-${row.id}-cover`}
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="nxGCard-ph" style={{ height: coverH }} aria-hidden data-testid={`gcard-${row.id}-ph`}>
            {initialsOf(title)}
          </span>
        )
      )}
      <span className="nxGCard-body">
        <span className="nxGCard-title">{title}</span>
        {metaVals.length > 0 && (
          <span className="nxGCard-meta">
            {metaVals.map(({ f, v }) =>
              f.type === "select" || f.type === "multiselect" ? (
                (Array.isArray(v) ? v.slice(0, 2) : [v]).map((one) => (
                  <OptionChip key={`${f.key}-${String(one)}`} field={f} value={one} />
                ))
              ) : (
                <span key={f.key} className="nxGCard-metaText">{formatCell(v, f.type)}</span>
              ),
            )}
          </span>
        )}
      </span>
    </a>
  );
}

export default function GalleryView({ object, rows, viewConfig, onOpen }: ViewProps) {
  const { coverField, titleField, metaFields, minCol } = galleryConfigOf(object, viewConfig);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(800);
  // cards present on the FIRST paint stagger in; everything after appears in place
  const entranceDone = React.useRef(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => { entranceDone.current = true; });
    return () => cancelAnimationFrame(id);
  }, []);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setViewportH(el.clientHeight || 800);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rafRef = React.useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollTop(wrapRef.current?.scrollTop ?? 0));
  };

  const count = columnCountForWidth(width || minCol, minCol, GAP);
  const colWidth = columnWidthFor(width || minCol, count, GAP);
  const { heights, layout } = React.useMemo(() => {
    const hs = rows.map((row) =>
      cardHeight({
        colWidth,
        coverConfigured: !!coverField,
        hasCover: !!coverUrlOf(row, coverField),
        hasMeta: metaFields.some((f) => {
          const v = row[f.key];
          return v !== null && v !== undefined && formatCell(v, f.type) !== "";
        }),
      }),
    );
    return { heights: hs, layout: packColumns(hs, count, GAP) };
  }, [rows, colWidth, count, coverField, metaFields]);

  if (rows.length === 0) {
    return (
      <div className="nxCard nxGEmpty" data-testid="gallery-empty">
        <span className="nxGEmpty-art" aria-hidden>▦</span>
        <span>No {object.label.toLowerCase()} yet.</span>
        <button type="button" className="nxRowLink nxGEmpty-cta" data-testid="gallery-empty-new"
          onClick={() => window.dispatchEvent(new Event("nx-new-record"))}>
          Create the first one
        </button>
        <style>{GALLERY_CSS}</style>
      </div>
    );
  }

  const visible = visibleIndices(layout, heights, scrollTop, viewportH, OVERSCAN);

  return (
    <div className="nxGWrap" data-testid={`gallery-${object.key}`} ref={wrapRef} onScroll={onScroll}>
      <div className="nxGCanvas" style={{ height: layout.height }}>
        {width > 0 &&
          visible.map((i) => {
            const row = rows[i];
            return (
              <GalleryCard
                key={row.id}
                object={object}
                row={row}
                titleField={titleField}
                metaFields={metaFields}
                coverField={coverField}
                colWidth={colWidth}
                x={layout.cols[i] * (colWidth + GAP)}
                y={layout.tops[i]}
                height={heights[i]}
                entranceIndex={entranceDone.current ? -1 : i}
                onOpen={onOpen}
              />
            );
          })}
      </div>
      <style>{GALLERY_CSS}</style>
    </div>
  );
}

const GALLERY_CSS = `
.nxGWrap{position:relative;overflow-y:auto;max-height:74vh;border-radius:var(--nx-radius-m)}
.nxGCanvas{position:relative}
.nxGCard{position:absolute;top:0;left:0;display:flex;flex-direction:column;overflow:hidden;
  background:var(--nx-bg-raised);border:1px solid var(--nx-border);border-radius:var(--nx-radius-m);
  box-shadow:var(--nx-shadow-1);text-decoration:none;color:var(--nx-fg);cursor:pointer;
  transition:box-shadow var(--nx-t-fast) var(--nx-ease),border-color var(--nx-t-fast) var(--nx-ease)}
.nxGCard:hover{border-color:var(--nx-border-strong)}
.nxGCard:focus-visible{outline:2px solid var(--nx-accent);outline-offset:2px}
.nxGCard-cover{width:100%;object-fit:cover;display:block;background:var(--nx-bg-sunken);flex:none}
.nxGCard-ph{display:grid;place-items:center;flex:none;
  background:linear-gradient(135deg,var(--nx-accent-soft),var(--nx-bg-sunken));
  color:var(--nx-accent);font:700 22px/1 var(--nx-font-sans);letter-spacing:.04em}
.nxGCard-body{display:flex;flex-direction:column;gap:5px;padding:10px 12px;min-height:0}
.nxGCard-title{font:600 13px/19px var(--nx-font-sans);display:-webkit-box;-webkit-line-clamp:2;
  -webkit-box-orient:vertical;overflow:hidden;max-height:38px}
.nxGCard-meta{display:flex;gap:5px;align-items:center;overflow:hidden;flex-wrap:nowrap;height:21px}
.nxGCard-metaText{color:var(--nx-fg-muted);font:var(--nx-text-meta);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nxGEmpty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 20px;color:var(--nx-fg-faint)}
.nxGEmpty-art{font-size:26px;color:var(--nx-fg-faint)}
.nxGEmpty-cta{background:none;border:0;cursor:pointer;font:inherit;color:var(--nx-accent)}
`;
