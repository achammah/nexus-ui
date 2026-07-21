import * as React from "react";
import type { Theme } from "@glideapps/glide-data-grid";
import type { OptionColor } from "../../types";
import { chipStyle } from "../../options";

/* Token → glide Theme derivation. The grid paints canvas LITERALS, so live
   --nx-* values resolve through a probe element at mount and RE-DERIVE when
   the theme flips (documentElement data-theme) or a skin lands (applySkin
   upserts the #nx-skin style tag). resolveCssColor mirrors the shared
   tokens/resolve.ts signature (its extraction is owned by the map-view work);
   swap to that import when it broadcasts. */

export const resolveCssColor = (expr: string, el: HTMLElement = document.body): string => {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = expr;
  el.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
};

const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export interface ChipColors { bg: string; fg: string }

export const OPTION_COLORS: readonly (OptionColor | "none")[] =
  ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink", "teal", "none"];

/* per-OptionColor literals computed from the SAME chipStyle() formula the DOM
   chips use — the browser evaluates the identical color-mix, nothing re-derived */
export const chipColorLiterals = (): Record<string, ChipColors> => {
  const out: Record<string, ChipColors> = {};
  for (const c of OPTION_COLORS) {
    const s = chipStyle(c === "none" ? undefined : c);
    out[c] = { bg: resolveCssColor(String(s.background)), fg: resolveCssColor(String(s.color)) };
  }
  return out;
};

/* --nx-* → glide Theme. Keys with no dedicated token map to the nearest
   existing one (bgSearchResult/bgBubbleSelected → accent-soft ·
   bgBubble/header-hover → bg-sunken · drilldownBorder → border-strong) —
   candidate tokens, listed in the lane report. */
export const deriveGridTheme = (): Partial<Theme> => ({
  accentColor: resolveCssColor("var(--nx-accent)"),
  accentFg: resolveCssColor("var(--nx-accent-fg)"),
  accentLight: resolveCssColor("var(--nx-accent-soft)"),
  textDark: resolveCssColor("var(--nx-fg)"),
  textMedium: resolveCssColor("var(--nx-fg-muted)"),
  textLight: resolveCssColor("var(--nx-fg-faint)"),
  textBubble: resolveCssColor("var(--nx-fg)"),
  bgIconHeader: resolveCssColor("var(--nx-fg-muted)"),
  fgIconHeader: resolveCssColor("var(--nx-bg)"),
  textHeader: resolveCssColor("var(--nx-fg-muted)"),
  textHeaderSelected: resolveCssColor("var(--nx-accent-fg)"),
  bgCell: resolveCssColor("var(--nx-bg)"),
  bgCellMedium: resolveCssColor("var(--nx-bg-raised)"),
  bgHeader: resolveCssColor("var(--nx-bg-raised)"),
  bgHeaderHasFocus: resolveCssColor("var(--nx-bg-sunken)"),
  bgHeaderHovered: resolveCssColor("var(--nx-bg-sunken)"),
  bgBubble: resolveCssColor("var(--nx-bg-sunken)"),
  bgBubbleSelected: resolveCssColor("var(--nx-accent-soft)"),
  bgSearchResult: resolveCssColor("var(--nx-accent-soft)"),
  borderColor: resolveCssColor("var(--nx-border)"),
  horizontalBorderColor: resolveCssColor("var(--nx-border)"),
  drilldownBorder: resolveCssColor("var(--nx-border-strong)"),
  linkColor: resolveCssColor("var(--nx-accent)"),
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
  headerFontStyle: "600 12px",
  baseFontStyle: "13px",
  fontFamily: cssVar("--nx-font-sans") || "sans-serif",
  editorFontSize: "13px",
  lineHeight: 1.4,
  roundingRadius: Number.parseFloat(cssVar("--nx-radius-s")) || 6,
});

export interface GridThemeState { theme: Partial<Theme>; chips: Record<string, ChipColors> }

export const useGridTheme = (): GridThemeState => {
  const [state, setState] = React.useState<GridThemeState>(() => ({
    theme: deriveGridTheme(),
    chips: chipColorLiterals(),
  }));
  React.useEffect(() => {
    const redo = () => setState({ theme: deriveGridTheme(), chips: chipColorLiterals() });
    // dark-mode toggle writes documentElement.dataset.theme
    const attrObs = new MutationObserver(redo);
    attrObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // a skin lands as an upserted <style id="nx-skin"> in head
    const headObs = new MutationObserver((muts) => {
      for (const m of muts) {
        const target = m.target instanceof Element ? m.target : m.target.parentElement;
        const hit =
          target?.id === "nx-skin" ||
          [...m.addedNodes].some((n) => n instanceof Element && n.id === "nx-skin");
        if (hit) { redo(); return; }
      }
    });
    headObs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => { attrObs.disconnect(); headObs.disconnect(); };
  }, []);
  return state;
};
