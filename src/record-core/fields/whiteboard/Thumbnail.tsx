import * as React from "react";
import { PenLine } from "lucide-react";
import type { FieldCellProps } from "../types";
import { isScene, liveElements, sceneSignature } from "./scene";
import { useNxTheme } from "./useNxTheme";

/* Memoized SVG thumbnail for a whiteboard value — list surfaces only (table cell,
   kanban card meta, the mobile record preview). The renderer loads excalidraw's
   exportToSvg through a dynamic import, so a list page costs NOTHING until a
   non-empty scene is actually on screen (empty/invalid cells render the static
   glyph and never import). Results cache by scene content + theme, capped. */

const CACHE_MAX = 100;
const cache = new Map<string, string>();
const remember = (key: string, svg: string) => {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, svg);
};

/* one in-flight export per cache key — N visible cells of the same scene share it */
const inFlight = new Map<string, Promise<string>>();

async function renderSvg(value: unknown, dark: boolean): Promise<string> {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const svg = await exportToSvg({
    elements: liveElements(value) as never,
    appState: { exportBackground: false, exportWithDarkMode: dark } as never,
    files: null,
    exportPadding: 4,
    skipInliningFonts: true,
  });
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  return svg.outerHTML;
}

export function Thumbnail({ field, value }: FieldCellProps) {
  const theme = useNxTheme();
  const empty = !isScene(value) || liveElements(value).length === 0;
  const key = empty ? "" : `${theme}:${sceneSignature(value)}`;
  const [svg, setSvg] = React.useState<string | null>(() => (key && cache.get(key)) || null);

  React.useEffect(() => {
    if (!key) return;
    const hit = cache.get(key);
    if (hit) { setSvg(hit); return; }
    setSvg(null); // theme/content changed → re-derive (glyph placeholder meanwhile)
    let on = true;
    const p = inFlight.get(key) ?? renderSvg(value, theme === "dark");
    inFlight.set(key, p);
    p.then((out) => {
      remember(key, out);
      inFlight.delete(key);
      if (on) setSvg(out);
    }).catch(() => {
      inFlight.delete(key);
      // failed export (corrupt elements) → the glyph stays; previewText covers text surfaces
    });
    return () => { on = false; };
  }, [key, value, theme]);

  if (empty || !svg) {
    return (
      <span className="nxWbThumb nxWbThumb--empty" aria-label={`${field.label}: empty canvas`}>
        <PenLine size={13} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className="nxWbThumb"
      data-ready=""
      aria-label={`${field.label}: canvas thumbnail`}
      // excalidraw's own sanitized export output, not user HTML
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
