import * as React from "react";
import type { FieldDef, ObjectConfig, RecordRow } from "../../types";
import type { ViewProps } from "../types";
import { formatCell } from "../../DataTable";
import { OptionChip, activeFields } from "../../options";
import { fieldPreviewText } from "../../fields/registry";
import { resolveOptionalGroupBy } from "../group";
import { sortRows, resolveSort } from "../sort";
import { coverUrlOf, buildGroups, type Group } from "./data";
import { cardHeight, columnCountForWidth, columnWidthFor, packColumns, visibleIndices } from "./pack";

/* Gallery view — a cover-card masonry with optional grouping (collapsible
   sections), sort, config-driven ordered card fields (rendered through the
   field registry), and configurable cover fit/source. Cards are real links
   (cmd/ctrl-click opens a genuine tab); a click opens the peek (or, when
   cardClick="open", the full record page). Rendering stays windowed per
   section, so a 10k-row object scrolls smoothly. Card heights are exact by
   construction (fixed-aspect cover, fixed title box, one line per card field). */

const MIN_COL: Record<string, number> = { s: 200, m: 260, l: 340 };
const GAP = 12;
const OVERSCAN = 600;
const SECTION_HEADER_H = 38;
const SECTION_GAP = 10;

const pickField = (fields: FieldDef[], key: unknown, types?: string[]): FieldDef | undefined => {
  if (typeof key !== "string" || key === "") return undefined;
  const f = fields.find((x) => x.key === key);
  if (!f) return undefined;
  return !types || types.includes(f.type) ? f : undefined;
};

export const galleryConfigOf = (object: ObjectConfig, viewConfig: Record<string, unknown>) => {
  const fields = activeFields(object.fields);
  const primary = fields.find((f) => f.primary) ?? fields[0];
  const coverField = pickField(fields, viewConfig.coverField, ["url", "links", "array"]);
  const coverFit: "cover" | "contain" = viewConfig.coverFit === "contain" ? "contain" : "cover";
  const titleField = pickField(fields, viewConfig.titleField) ?? primary;
  // cardFields is the ordered card-field list; metaFields stays honored as a
  // back-compat alias (cardFields wins). Default: first two non-primary,
  // non-cover fields.
  const raw = Array.isArray(viewConfig.cardFields)
    ? (viewConfig.cardFields as unknown[])
    : Array.isArray(viewConfig.metaFields)
      ? (viewConfig.metaFields as unknown[])
      : fields.filter((f) => !f.primary && f.key !== coverField?.key).slice(0, 2).map((f) => f.key);
  const cardFields = raw.map((k) => fields.find((f) => f.key === String(k))).filter((f): f is FieldDef => !!f);
  const size = typeof viewConfig.cardSize === "string" && viewConfig.cardSize in MIN_COL ? (viewConfig.cardSize as string) : "m";
  const cardClick: "peek" | "open" = viewConfig.cardClick === "open" ? "open" : "peek";
  // Airtable-parity default: card fields render label-less (the value alone —
  // a colored chip for select, quiet text otherwise). Set cardFieldLabels:true
  // to prefix each value with its field label (the form-like look).
  const cardFieldLabels = viewConfig.cardFieldLabels === true;
  return { coverField, coverFit, titleField, cardFields, minCol: MIN_COL[size], cardClick, cardFieldLabels };
};

const shownCardFields = (row: RecordRow, cardFields: FieldDef[]) =>
  cardFields
    .map((f) => ({ f, v: row[f.key] }))
    .filter(({ f, v }) => v !== null && v !== undefined && formatCell(v, f.type) !== "");

function GalleryCard({
  object, row, titleField, cardFields, cardFieldLabels, coverField, coverFit, colWidth, x, y, height,
  entranceIndex, selectable, selected, onToggleSelect, cardClick, onPeek,
}: {
  object: ObjectConfig; row: RecordRow; titleField: FieldDef; cardFields: FieldDef[]; cardFieldLabels: boolean;
  coverField?: FieldDef; coverFit: "cover" | "contain"; colWidth: number; x: number; y: number; height: number;
  entranceIndex: number; selectable: boolean; selected: boolean; onToggleSelect: () => void;
  cardClick: "peek" | "open"; onPeek: (id: string) => void;
}) {
  const [broken, setBroken] = React.useState(false);
  const title = formatCell(row[titleField.key], titleField.type) || "—";
  const url = coverUrlOf(row, coverField);
  const showImg = !!url && !broken;
  const coverH = coverField ? Math.round(colWidth * (url ? 0.75 : 0.42)) : 0;
  const shown = shownCardFields(row, cardFields);
  return (
    <a
      href={`#/o/${object.key}/r/${row.id}`}
      className={`nxGCard nx-hover-lift nx-tap-scale${entranceIndex >= 0 ? " nx-rise-in-sm" : ""}${selected ? " nxGCard--sel" : ""}`}
      style={{
        width: colWidth, height,
        // position via CSS `translate` (not `transform`) so the entrance/hover
        // transforms compose instead of collapsing windowed cards to (0,0)
        translate: `${x}px ${y}px`,
        ...(entranceIndex >= 0 ? ({ "--i": Math.min(entranceIndex, 8) } as React.CSSProperties) : {}),
      }}
      data-testid={`gcard-${row.id}`}
      data-selected={selected || undefined}
      aria-label={title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return; // real link → new tab
        if (cardClick === "open") return; // let the href navigate to the record page
        e.preventDefault();
        onPeek(row.id);
      }}
    >
      {selectable && (
        <button
          type="button"
          className="nxGCard-sel"
          data-testid={`gcard-${row.id}-select`}
          aria-label={selected ? "Deselect" : "Select"}
          aria-pressed={selected}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(); }}
        >
          {selected ? "✓" : ""}
        </button>
      )}
      {coverField &&
        (showImg ? (
          <img
            className="nxGCard-cover"
            style={{ height: coverH, objectFit: coverFit }}
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            data-testid={`gcard-${row.id}-cover`}
            onError={() => setBroken(true)}
          />
        ) : (
          /* no cover → a quiet neutral surface with a muted media glyph (never
             title initials — an avatar in a photo grid reads as a toy) */
          <span className="nxGCard-ph" style={{ height: coverH }} aria-hidden data-testid={`gcard-${row.id}-ph`}>
            <svg className="nxGCard-phIcon" width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="9" r="1.6" />
              <path d="m21 15-4.5-4.5L6 21" />
            </svg>
          </span>
        ))}
      <span className={`nxGCard-body${cardFieldLabels ? "" : " nxGCard-body--dense"}`}>
        <span className="nxGCard-title">{title}</span>
        {shown.map(({ f, v }) => (
          <span key={f.key} className="nxGCard-field" data-field={f.key}>
            {cardFieldLabels && <span className="nxGCard-fieldLabel">{f.label}</span>}
            <span className="nxGCard-fieldVal">
              {f.type === "select" || f.type === "multiselect" ? (
                (Array.isArray(v) ? v.slice(0, 3) : [v]).map((one) => (
                  <OptionChip key={`${f.key}-${String(one)}`} field={f} value={one} />
                ))
              ) : (
                fieldPreviewText(f.type, v) ?? formatCell(v, f.type)
              )}
            </span>
          </span>
        ))}
      </span>
    </a>
  );
}

export default function GalleryView({
  object, rows, users, readOnly, viewConfig, viewState, onViewState, onPeek, selection, onSelectionChange,
}: ViewProps) {
  const { coverField, coverFit, titleField, cardFields, minCol, cardClick, cardFieldLabels } = galleryConfigOf(object, viewConfig);
  const groupKey = resolveOptionalGroupBy(object, viewConfig, viewState);
  const groupField = groupKey ? object.fields.find((f) => f.key === groupKey) : undefined;
  // grouped → the group field is redundant on each card (every card in the section
  // already carries that value); hide it, matching Airtable's grouped gallery
  const effectiveCardFields = groupField ? cardFields.filter((f) => f.key !== groupField.key) : cardFields;
  const { key: sortKey, dir: sortDir } = resolveSort(object, viewConfig, viewState);
  const sortField = sortKey ? activeFields(object.fields).find((f) => f.key === sortKey) : undefined;
  const collapsed = React.useMemo(
    () => new Set((Array.isArray(viewState.galleryCollapsed) ? viewState.galleryCollapsed : []) as string[]),
    [viewState.galleryCollapsed],
  );

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(800);
  const entranceDone = React.useRef(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => { entranceDone.current = true; });
    return () => cancelAnimationFrame(id);
  }, []);
  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => { setWidth(el.clientWidth); setViewportH(el.clientHeight || 800); };
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

  const { sections, totalHeight } = React.useMemo(() => {
    const sorted = sortRows(rows, sortField, sortDir);
    const groups: Group[] = groupField ? buildGroups(sorted, groupField, users) : [{ value: "", label: "", rows: sorted }];
    let y = 0;
    const secs = groups.map((g) => {
      const heights = g.rows.map((row) =>
        cardHeight({
          colWidth,
          coverConfigured: !!coverField,
          hasCover: !!coverUrlOf(row, coverField),
          fieldRows: shownCardFields(row, effectiveCardFields).length,
        }),
      );
      const layout = packColumns(heights, count, GAP);
      const isCollapsed = !!groupField && collapsed.has(g.value);
      const headerH = groupField ? SECTION_HEADER_H : 0;
      const yHeader = y;
      const yCards = yHeader + headerH;
      const cardsH = isCollapsed ? 0 : layout.height;
      y = yCards + cardsH + (groupField ? SECTION_GAP : 0);
      return { ...g, heights, layout, isCollapsed, yHeader, yCards, cardsH };
    });
    return { sections: secs, totalHeight: y };
  }, [rows, sortField, sortDir, groupField, users, colWidth, count, coverField, effectiveCardFields, collapsed]);

  const toggleCollapse = (value: string) => {
    const next = new Set(collapsed);
    next.has(value) ? next.delete(value) : next.add(value);
    onViewState({ galleryCollapsed: [...next] });
  };
  const toggleSelect = (id: string) => onSelectionChange({ ...selection, [id]: !selection[id] });

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

  const lo = scrollTop - OVERSCAN;
  const hi = scrollTop + viewportH + OVERSCAN;
  return (
    <div className="nxGWrap" data-testid={`gallery-${object.key}`} ref={wrapRef} onScroll={onScroll}>
      <div className="nxGCanvas" style={{ height: totalHeight }}>
        {sections.map((s) => (
          <React.Fragment key={s.value || "_all"}>
            {groupField && (
              <button
                type="button"
                className="nxGSection"
                style={{
                  translate: `0 ${s.yHeader}px`, width: "100%",
                  ...(s.color ? ({ "--group-accent": `var(--nx-opt-${s.color})` } as React.CSSProperties) : {}),
                }}
                data-testid={`gsection-${s.value || "empty"}`}
                aria-expanded={!s.isCollapsed}
                onClick={() => toggleCollapse(s.value)}
              >
                <span className="nxGSection-chev" data-collapsed={s.isCollapsed || undefined} aria-hidden>▾</span>
                {s.value && groupField.type === "select" ? (
                  <OptionChip field={groupField} value={s.value} />
                ) : (
                  <span className="nxGSection-label">{s.label}</span>
                )}
                <span className="nxGSection-count" data-testid={`gsection-${s.value || "empty"}-count`}>{s.rows.length}</span>
              </button>
            )}
            {!s.isCollapsed && width > 0 && s.yCards < hi && s.yCards + s.cardsH > lo &&
              visibleIndices(s.layout, s.heights, scrollTop - s.yCards, viewportH, OVERSCAN).map((i) => {
                const row = s.rows[i];
                return (
                  <GalleryCard
                    key={row.id}
                    object={object}
                    row={row}
                    titleField={titleField}
                    cardFields={effectiveCardFields}
                    cardFieldLabels={cardFieldLabels}
                    coverField={coverField}
                    coverFit={coverFit}
                    colWidth={colWidth}
                    x={s.layout.cols[i] * (colWidth + GAP)}
                    y={s.yCards + s.layout.tops[i]}
                    height={s.heights[i]}
                    entranceIndex={entranceDone.current ? -1 : i}
                    selectable={!readOnly}
                    selected={!!selection[row.id]}
                    onToggleSelect={() => toggleSelect(row.id)}
                    cardClick={cardClick}
                    onPeek={onPeek}
                  />
                );
              })}
          </React.Fragment>
        ))}
      </div>
      <style>{GALLERY_CSS}</style>
    </div>
  );
}

const GALLERY_CSS = `
.nxGWrap{position:relative;overflow-y:auto;max-height:74vh;border-radius:var(--nx-radius-m)}
.nxGCanvas{position:relative}
.nxGSection{position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;height:${SECTION_HEADER_H - 8}px;
  padding:0 10px;background:var(--nx-bg-sunken);border:0;border-left:3px solid var(--group-accent,transparent);
  border-radius:var(--nx-radius-s);cursor:pointer;color:var(--nx-fg);font:inherit;text-align:left}
.nxGSection-chev{font-size:11px;color:var(--nx-fg-muted);transition:transform var(--nx-t-fast) var(--nx-ease)}
.nxGSection-chev[data-collapsed]{transform:rotate(-90deg)}
.nxGSection-label{font:600 13px/1 var(--nx-font-sans)}
.nxGSection-count{color:var(--nx-fg-muted);font:var(--nx-text-meta);background:var(--nx-bg-sunken);
  border-radius:999px;padding:1px 8px}
.nxGCard{position:absolute;top:0;left:0;display:flex;flex-direction:column;overflow:hidden;
  background:var(--nx-bg-raised);border:1px solid var(--nx-border);border-radius:var(--nx-radius-m);
  box-shadow:var(--nx-shadow-1);text-decoration:none;color:var(--nx-fg);cursor:pointer;
  transition:box-shadow var(--nx-t-fast) var(--nx-ease),border-color var(--nx-t-fast) var(--nx-ease)}
.nxGCard:hover{border-color:var(--nx-border-strong)}
.nxGCard:focus-visible{outline:2px solid var(--nx-accent);outline-offset:2px}
.nxGCard--sel{border-color:var(--nx-accent);box-shadow:0 0 0 1px var(--nx-accent) inset,var(--nx-shadow-1)}
.nxGCard-sel{position:absolute;top:6px;left:6px;z-index:1;width:20px;height:20px;display:grid;place-items:center;
  border-radius:6px;border:1px solid var(--nx-border-strong);background:var(--nx-bg-raised);color:var(--nx-accent);
  font-size:12px;line-height:1;cursor:pointer;opacity:0;transition:opacity var(--nx-t-fast) var(--nx-ease)}
.nxGCard:hover .nxGCard-sel,.nxGCard--sel .nxGCard-sel,.nxGCard-sel:focus-visible{opacity:1}
.nxGCard-cover{width:100%;object-fit:cover;display:block;background:var(--nx-bg-sunken);flex:none}
.nxGCard-ph{display:grid;place-items:center;flex:none;background:var(--nx-bg-sunken)}
.nxGCard-phIcon{color:var(--nx-fg-faint);opacity:.5}
.nxGCard-body{display:flex;flex-direction:column;gap:5px;padding:10px 12px;min-height:0}
.nxGCard-body--dense{gap:6px}
.nxGCard-title{font:600 13.5px/19px var(--nx-font-sans);letter-spacing:-.01em;color:var(--nx-fg);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-height:38px}
.nxGCard-field{display:flex;align-items:center;gap:6px;height:22px;overflow:hidden;white-space:nowrap}
.nxGCard-fieldLabel{color:var(--nx-fg-faint);font:var(--nx-text-meta);flex:none}
.nxGCard-fieldVal{color:var(--nx-fg-muted);font:var(--nx-text-meta);overflow:hidden;text-overflow:ellipsis;
  display:flex;gap:4px;align-items:center;min-width:0}
.nxGEmpty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 20px;color:var(--nx-fg-faint)}
.nxGEmpty-art{font-size:26px;color:var(--nx-fg-faint)}
.nxGEmpty-cta{background:none;border:0;cursor:pointer;font:inherit;color:var(--nx-accent)}
`;
