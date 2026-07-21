import * as React from "react";

/* Token → literal color resolution for GL/canvas consumers (maplibre paint, canvas
   grids) — runtimes that cannot read CSS custom properties. A probe element collapses
   var() chains, color-mix() and skin-engine output into a computed color; a 1x1 canvas
   normalizes THAT into "rgba(r, g, b, a)" (GL color parsers reject the oklab()/color()
   serializations getComputedStyle can return for color-mix). Re-resolution triggers
   mirror the app's live theming surfaces: the <html> data-theme stamp, the <head>
   style tags the skin engine writes (skins/skin.ts applySkin, the gallery's preview
   tag), and the OS color scheme. */

let sharedCtx: CanvasRenderingContext2D | null | undefined;
const canvasCtx = (): CanvasRenderingContext2D | null => {
  if (sharedCtx === undefined) {
    try {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      sharedCtx = c.getContext("2d", { willReadFrequently: true });
    } catch {
      sharedCtx = null;
    }
  }
  return sharedCtx ?? null;
};

/* Resolve ANY CSS color expression — `var(--nx-accent)`, a bare hex, or a full
   `color-mix(in oklab, var(--nx-opt-blue) 16%, var(--nx-bg-raised))` — to an
   rgba() literal. `el` scopes the lookup (element-scoped custom properties);
   defaults to the document body. Invalid expressions return "". */
export function resolveCssColor(expr: string, el?: HTMLElement): string {
  if (typeof document === "undefined" || !expr) return "";
  const host = el ?? document.body ?? document.documentElement;
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  probe.style.color = expr;
  if (!probe.style.color) return ""; // the browser rejected the expression
  host.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  if (!computed) return "";
  const ctx = canvasCtx();
  if (!ctx) return computed; // no canvas (rare) — hand back the computed form
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
}

/* Resolve one --nx-* token (leading dashes optional) to an rgba() literal. */
export function resolveTokenColor(token: string, el?: HTMLElement): string {
  const name = token.startsWith("--") ? token : `--${token}`;
  return resolveCssColor(`var(${name})`, el);
}

/* Imperative twin for canvas repaint loops: resolves now + on every theme/skin/
   scheme change, calling back with {token: literal}. Returns the unsubscribe. */
export function subscribeTokenColors(
  tokens: string[],
  cb: (colors: Record<string, string>) => void,
  el?: HTMLElement,
): () => void {
  if (typeof document === "undefined") return () => {};
  const fire = () => {
    const out: Record<string, string> = {};
    for (const t of tokens) out[t] = resolveTokenColor(t, el);
    cb(out);
  };
  fire();
  const mo = new MutationObserver(fire);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // skin tags may not exist yet — watch <head> for arrivals AND text swaps
  mo.observe(document.head, { childList: true, subtree: true, characterData: true });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", fire);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", fire);
  };
}

/* Hook form: literal map, resolved synchronously on first render (GL paint needs
   real values on frame one) and re-resolved live on theme/skin/scheme changes. */
export function useTokenColors(tokens: string[], el?: HTMLElement | null): Record<string, string> {
  const key = tokens.join("|");
  const [colors, setColors] = React.useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (typeof document !== "undefined") for (const t of tokens) out[t] = resolveTokenColor(t, el ?? undefined);
    return out;
  });
  React.useEffect(
    () => subscribeTokenColors(key ? key.split("|") : [], setColors, el ?? undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, el],
  );
  return colors;
}
