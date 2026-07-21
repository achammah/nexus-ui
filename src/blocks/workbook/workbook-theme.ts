import * as React from "react";

/* Token -> Univer theme. Univer paints on its own canvas + Tailwind chrome, so it
   can't read our --nx-* vars directly for its accent: we resolve the live tokens to
   literals (a hidden probe, same technique as the grid view's theme.ts) and hand
   Univer a theme object whose `primary` scale is our brand accent, plus a dark-mode
   flip synced to documentElement[data-theme]. The chrome surfaces (toolbar, menus)
   additionally follow --nx-* through the --univer-* overrides in workbook.css, which
   re-resolve for free on a theme/skin flip. Everything re-derives on the SAME two
   signals the grid view observes: the data-theme attribute and the #nx-skin tag. */

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

/* Univer's theme is a record of color scales; `primary` (50..900) drives its canvas
   accent (active cell, selection border, primary buttons). We span our single
   --nx-accent token across the scale with sRGB color-mix probes (sRGB, not oklab, so
   the resolved value stays rgb for Univer's canvas — see toRgb) so light tints and
   dark shades both read against Univer's surfaces. `resolve` is injected so the math
   is unit-testable without a browser. */
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

/* Merge our accent over a base theme (Univer's defaultTheme, passed by the surface
   from the lazy chunk so @univerjs/themes stays out of the eager bundle). */
export function deriveWorkbookTheme(base: UniverTheme, resolve: (expr: string) => string): UniverTheme {
  return { ...base, primary: accentScale(resolve) };
}

/* A nonce that bumps whenever the theme flips (dark toggle writes data-theme) or a
   skin lands (#nx-skin <style> upserted in head) — the surface re-applies the theme
   object + dark mode when it changes. Mirrors the grid view's observer wiring. */
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
