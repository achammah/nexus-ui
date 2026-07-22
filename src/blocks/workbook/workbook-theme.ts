import * as React from "react";

/* Token -> Univer theme. Univer paints on its own canvas + Tailwind chrome, so it
   can't read our --nx-* vars directly: we resolve the live tokens to literals (a
   hidden probe, same technique as the grid view's theme.ts) and hand Univer a theme
   object built from our palette. Two facts about Univer 0.25 shape everything here:
   (1) its DOM chrome reads `--univer-*` vars injected on :root from that theme
   object, and `.univer-dark` swaps ROLE classes, never values — so ONE value-set
   per mode themes all chrome (workbook.css owns the exact per-mode DOM values);
   (2) its canvas derives dark mode by matrix-INVERTING the light palette
   (CanvasColorService), so the JS theme object must stay LIGHT-anchored — we
   resolve tokens under a forced-light probe even when the app mounts in dark.
   Everything re-derives on the SAME two signals the grid view observes: the
   data-theme attribute and the #nx-skin tag. */

/* Univer's CanvasColorService parses ONLY rgb/hex. A token or color-mix resolves
   through getComputedStyle as oklab()/color(srgb …) in modern engines, and the 2D
   fillStyle setter PRESERVES color() notation — so painting the resolved color onto
   a 1x1 surface and reading the sRGB pixel back is the reliable normalization: it
   yields integer rgb()/rgba() for any CSS Color 4 input. An unparseable value paints
   the "#000" fallback; resolved tokens are always valid, so that path is unreached. */
let _rgbCtx: CanvasRenderingContext2D | null = null;
function toRgb(color: string): string {
  if (typeof document === "undefined") return color;
  _rgbCtx ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!_rgbCtx) return color;
  _rgbCtx.clearRect(0, 0, 1, 1);
  _rgbCtx.fillStyle = "#000";
  try { _rgbCtx.fillStyle = color; } catch { return color; }
  _rgbCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = _rgbCtx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

export const resolveCssColor = (expr: string, el: HTMLElement = document.body): string => {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = expr;
  el.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return toRgb(out);
};

export const isDarkTheme = (): boolean => document.documentElement.dataset.theme === "dark";

/* Resolve token expressions with the document forced LIGHT for the duration of one
   synchronous callback. The canvas theme must be light-anchored (Univer inverts it
   for dark itself); when the app is in dark the live tokens resolve dark, so we
   stamp data-theme="light", resolve, and restore — synchronous, so no paint happens
   in between. The flip DOES tick the theme observers below; that is safe by design:
   the surface's re-theme effect exits on an applied-signature match, so the probe's
   own mutations cost one no-op pass instead of a suppression window that could
   swallow a real flip landing at the same instant. */
export function withLightTokens<T>(fn: (resolve: (expr: string) => string) => T): T {
  if (typeof document === "undefined" || !isDarkTheme()) return fn(resolveCssColor);
  const root = document.documentElement;
  const prev = root.dataset.theme;
  root.dataset.theme = "light";
  try {
    return fn(resolveCssColor);
  } finally {
    root.dataset.theme = prev as string;
  }
}

/* The two theme inputs the workbook derives from, separately signed. The SKIN part
   reads EVERY #nx-skin style in document order (the app upserts one at boot when
   the config names a skin; a host or test may append another — getElementById
   would see only the first and blind the signature to the one that actually
   cascades). The split matters: the derived Univer theme is a function of the
   TOKENS only (always light-anchored), so a dark/light flip re-syncs Univer's
   dark mode WITHOUT re-deriving — the forced-light probe never has to touch
   data-theme on the flip path at all. */
export function skinSignature(): string {
  if (typeof document === "undefined") return "";
  return [...document.querySelectorAll("style#nx-skin")].map((el) => el.textContent ?? "").join("§");
}
export function themeSignature(): string {
  if (typeof document === "undefined") return "";
  return (document.documentElement.dataset.theme ?? "") + "|" + skinSignature();
}

/* Univer's theme is a record of color scales. `primary` (50..900) drives the accent
   (active cell, selection, primary buttons); `gray` (50..900) drives every neutral —
   canvas gridlines, row/col headers, and (via the injected vars) all DOM chrome;
   `white` is the cell/panel surface; red/green/yellow are semantic. We rebuild all
   of them from our LIGHT tokens so the whole surface — not just the accent — sits
   on our palette. `resolve` is injected so the math is unit-testable without a
   browser. sRGB mixes, not oklab, so resolved values stay rgb for the canvas. */
export type ColorScale = Record<string, string>;
export type UniverTheme = Record<string, string | ColorScale>;

export function accentScale(resolve: (expr: string) => string): ColorScale {
  const tint = (pct: number) => resolve(`color-mix(in srgb, var(--nx-accent) ${pct}%, white)`);
  const shade = (pct: number) => resolve(`color-mix(in srgb, var(--nx-accent) ${pct}%, black)`);
  const accent = resolve("var(--nx-accent)");
  return {
    50: tint(8),
    100: tint(16),
    200: tint(30),
    300: tint(48),
    400: tint(70),
    500: accent,
    600: shade(88),
    700: shade(72),
    800: shade(56),
    900: shade(44),
  };
}

/* The warm neutral ramp, light role table: 50/100 subtle surfaces, 200/300 borders,
   400..900 a text ramp toward --nx-fg. Univer's stock scale is a cool blue-gray;
   this is the single biggest "foreign widget" tell, so every step comes from our
   neutral tokens (mix steps fill the gaps between the few tokens we define).
   gray.300 carries a LOW ACCENT TINT: its one visible canvas consumer is the
   frozen-pane divider (HeaderFreezeRenderController re-reads it on every
   setTheme) — a quiet brand rule instead of a heavy gray bar; the DOM chrome
   reads the independent --univer-* CSS tables, so this stays canvas-scoped. */
export function neutralScale(resolve: (expr: string) => string): ColorScale {
  const mixFg = (pct: number) => resolve(`color-mix(in srgb, var(--nx-fg) ${pct}%, var(--nx-fg-muted))`);
  return {
    50: resolve("var(--nx-bg)"),
    100: resolve("var(--nx-bg-sunken)"),
    200: resolve("var(--nx-border)"),
    300: resolve("color-mix(in srgb, var(--nx-accent) 25%, var(--nx-border))"),
    400: resolve("var(--nx-fg-faint)"),
    500: resolve("var(--nx-fg-muted)"),
    600: mixFg(35),
    700: mixFg(65),
    800: mixFg(85),
    900: resolve("var(--nx-fg)"),
  };
}

/* Semantic scales: our tokens define one value per state; neighbors derive by mix
   so Univer's 300/400/600 picks stay coherent. Only the steps Univer's core preset
   actually consumes are generated. */
function semanticScale(resolve: (expr: string) => string, token: string): ColorScale {
  const mix = (pct: number, into: string) => resolve(`color-mix(in srgb, var(${token}) ${pct}%, ${into})`);
  return {
    100: mix(14, "white"),
    300: mix(55, "white"),
    400: mix(78, "white"),
    500: resolve(`var(${token})`),
    600: mix(82, "black"),
  };
}

/* Merge our palette over a base theme (Univer's defaultTheme, passed by the surface
   from the lazy chunk so @univerjs/themes stays out of the eager bundle). Black and
   blue stay stock: black feeds shadows/scrims, blue is the universal link tone. */
export function deriveWorkbookTheme(base: UniverTheme, resolve: (expr: string) => string): UniverTheme {
  return {
    ...base,
    primary: accentScale(resolve),
    gray: neutralScale(resolve),
    white: resolve("var(--nx-bg-raised)"),
    red: { ...(base.red as ColorScale), ...semanticScale(resolve, "--nx-danger") },
    green: { ...(base.green as ColorScale), ...semanticScale(resolve, "--nx-ok") },
    yellow: { ...(base.yellow as ColorScale), ...semanticScale(resolve, "--nx-warn") },
  };
}

/* Canvas grid theme — the sheet-canvas surfaces the theme object does NOT reach:
   the gridline stroke (an open `ctx.renderConfig.gridlinesColor` hook, stock
   fallback rgb(214,216,219)) and the row/column header paint (render-component
   `setCustomHeader`, stock cool-gray fills + #000 text). Light-anchored like the
   main theme (Univer's canvas inverts for dark). Gridlines sit SOFTER than the
   border token — faint guides, the modern-sheet feel — and headers take the sunken
   surface, muted text, hairline borders and the app's own font. */
export interface CanvasGridTheme {
  gridlinesColor: string;
  header: {
    backgroundColor: string;
    fontColor: string;
    borderColor: string;
    fontFamily: string;
  };
}

export function canvasGridTheme(resolve: (expr: string) => string): CanvasGridTheme {
  const fontFamily =
    typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "sans-serif";
  return {
    // whisper lines: a modern sheet's gridlines are barely-there guides — the
    // delta against the stock gray mesh must be OBVIOUS at normal zoom
    gridlinesColor: resolve("color-mix(in srgb, var(--nx-border) 32%, var(--nx-bg-raised))"),
    header: {
      // Notion-model chrome: the header band is ACHROMATIC-but-ours — our sunken
      // surface, our font, our hairlines. Brand color lives in the STATES around
      // it (the accent freeze rule, the active-header wash + stroke, selection),
      // which read clearly against the neutral band
      backgroundColor: resolve("var(--nx-bg-sunken)"),
      fontColor: resolve("var(--nx-fg-muted)"),
      borderColor: resolve("var(--nx-border)"),
      fontFamily,
    },
  };
}

/* A nonce that bumps whenever the theme flips (dark toggle writes data-theme) or a
   skin lands (#nx-skin <style> upserted in head) — the surface re-derives + re-sets
   the Univer theme when it changes. Mirrors the grid view's observer wiring. Bumps
   are NEVER suppressed (the applied-signature check in the surface dedupes), so a
   real flip can't be lost to a suppression window. */
export function useThemeNonce(): number {
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setNonce((n) => n + 1);
    const attrObs = new MutationObserver(bump);
    attrObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const headObs = new MutationObserver((muts) => {
      for (const m of muts) {
        const target = m.target instanceof Element ? m.target : m.target.parentElement;
        const hit =
          target?.id === "nx-skin" ||
          [...m.addedNodes].some((n) => n instanceof Element && n.id === "nx-skin");
        if (hit) { bump(); return; }
      }
    });
    headObs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => { attrObs.disconnect(); headObs.disconnect(); };
  }, []);
  return nonce;
}
