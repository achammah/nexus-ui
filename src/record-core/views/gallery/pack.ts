// adapted from usememos/memos ColumnGrid (MIT) — the deterministic column-packing core
/* Masonry math for the gallery view, kept pure (no React, no DOM) so node:test
   covers it. Cards are assigned to the SHORTEST column in row order over
   deterministic heights (the view computes exact card heights from config +
   row data, so no measure pass exists and positions never reshuffle), then
   windowing renders only the cards intersecting the viewport. */

export interface PackedLayout {
  /* per card: column index */
  cols: number[];
  /* per card: y offset inside its column */
  tops: number[];
  /* total content height (tallest column) */
  height: number;
}

/* how many columns fit a width, one per minColWidth (+gap), floored at 1 */
export const columnCountForWidth = (width: number, minColWidth: number, gap: number): number =>
  Math.max(1, Math.floor((width + gap) / (minColWidth + gap)));

/* whole-pixel column width for a count that fills the row */
export const columnWidthFor = (width: number, count: number, gap: number): number =>
  count > 1 ? Math.floor((width - gap * (count - 1)) / count) : width;

/* shortest-column assignment in item order — reading order stays roughly
   left-to-right, and appended rows never move earlier cards */
export const packColumns = (heights: number[], columnCount: number, gap: number): PackedLayout => {
  const totals = new Array<number>(Math.max(1, columnCount)).fill(0);
  const cols = new Array<number>(heights.length);
  const tops = new Array<number>(heights.length);
  for (let i = 0; i < heights.length; i++) {
    let col = 0;
    for (let c = 1; c < totals.length; c++) if (totals[c] < totals[col]) col = c;
    cols[i] = col;
    tops[i] = totals[col];
    totals[col] += Math.max(0, heights[i]) + gap;
  }
  const height = Math.max(0, ...totals.map((t) => (t > 0 ? t - gap : 0)));
  return { cols, tops, height };
};

/* indices of cards intersecting [scrollTop - overscan, scrollTop + viewport + overscan] */
export const visibleIndices = (
  layout: PackedLayout,
  heights: number[],
  scrollTop: number,
  viewportH: number,
  overscan: number,
): number[] => {
  const lo = scrollTop - overscan;
  const hi = scrollTop + viewportH + overscan;
  const out: number[] = [];
  for (let i = 0; i < heights.length; i++) {
    const top = layout.tops[i];
    if (top < hi && top + heights[i] > lo) out.push(i);
  }
  return out;
};

/* deterministic card height: fixed-aspect cover (or the shorter placeholder
   block), a fixed two-line title box, one meta row when the row carries meta
   values. Every term is derived from config + row data — no measurement. */
export const cardHeight = (opts: {
  colWidth: number;
  hasCover: boolean;
  coverConfigured: boolean;
  /* number of configured card fields that carry a value for this row — each is
     one compact no-wrap line (cover fit never changes height; the aspect holds) */
  fieldRows: number;
}): number => {
  const cover = opts.coverConfigured ? Math.round(opts.colWidth * (opts.hasCover ? 0.75 : 0.42)) : 0;
  const pad = 10;
  const title = 38; // two-line box at the card title's fixed line height
  const fields = Math.max(0, opts.fieldRows) * 22; // one line per shown card field
  return cover + pad + title + fields + pad;
};
