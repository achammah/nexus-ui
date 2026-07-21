/* Pure selection-foreground contrast math for the Sheet grid — no React, no
   DOM, so it unit-tests directly. A selected cell paints `accentLight` as its
   background and glide draws cell text with `textDark`, which never adapts; a
   dark selection color (a bold skin, dark mode) then leaves dark text
   illegible. deriveSelectionText returns the text-key overrides that keep the
   selected cell legible, or {} when the base ink already contrasts (the common
   light-selection case, where tokens are left untouched). */

export type Rgb = readonly [number, number, number];

/* getComputedStyle colours arrive as `rgb(r, g, b)` or `rgba(r, g, b, a)` */
export const parseColor = (s: string): { rgb: Rgb; a: number } => {
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (!m) return { rgb: [0, 0, 0], a: 1 };
  const p = m[1].split(/[,/\s]+/).filter(Boolean);
  const n = (i: number) => Number.parseFloat(p[i]) || 0;
  const rawA = p[3];
  const a = rawA === undefined ? 1 : rawA.endsWith("%") ? n(3) / 100 : n(3);
  return { rgb: [n(0), n(1), n(2)], a: Number.isFinite(a) ? a : 1 };
};

/* src-over-dst alpha composite → an opaque rgb, so a TRANSLUCENT selection
   colour is judged against what actually shows through it: the cell background */
export const flatten = (src: { rgb: Rgb; a: number }, dst: Rgb): Rgb => [
  src.rgb[0] * src.a + dst[0] * (1 - src.a),
  src.rgb[1] * src.a + dst[1] * (1 - src.a),
  src.rgb[2] * src.a + dst[2] * (1 - src.a),
];

/* WCAG relative luminance */
export const relLuminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/* WCAG contrast ratio between two relative luminances */
export const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export interface SelectionThemeInput {
  bgCell?: string;
  accentLight?: string;
  textDark?: string;
}
export interface SelectionText {
  textDark: string;
  textMedium: string;
  textLight: string;
  textBubble: string;
}

/* The text-key overrides for a selected cell, or {} when the base ink already
   reads. When it does not, flip to the higher-contrast pole (white/black — the
   universal extremes) and carry a muted/faint ramp from it so overflow counts
   and secondary text stay legible too. AA (4.5:1) is the trip point. */
export const deriveSelectionText = (base: SelectionThemeInput): Partial<SelectionText> => {
  const bgCell = parseColor(base.bgCell ?? "rgb(255,255,255)").rgb;
  const selBg = flatten(parseColor(base.accentLight ?? "rgba(0,0,0,0)"), bgCell);
  const selLum = relLuminance(selBg);
  const inkLum = relLuminance(parseColor(base.textDark ?? "rgb(0,0,0)").rgb);
  if (contrastRatio(inkLum, selLum) >= 4.5) return {};
  const ink = contrastRatio(1, selLum) >= contrastRatio(0, selLum) ? "255,255,255" : "0,0,0";
  return {
    textDark: `rgb(${ink})`,
    textMedium: `rgba(${ink},0.78)`,
    textLight: `rgba(${ink},0.55)`,
    textBubble: `rgb(${ink})`,
  };
};
