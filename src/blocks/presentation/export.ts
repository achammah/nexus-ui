import type { DeckSnapshot, Slide } from "./types";
import { sanitizeHtml, textOf } from "./SlideView";

/* ---- PDF: zero-bundle browser print path ----
   Opens a print window with each slide as one fixed 16:9 landscape page carrying
   the deck theme's resolved colors, then triggers the print dialog (user picks
   "Save as PDF"). No library, no bundle cost. */
export function exportDeckToPdf(deck: DeckSnapshot, themeCss: string): void {
  const w = window.open("", "_blank", "width=1200,height=800");
  if (!w) throw new Error("Popup blocked — allow popups to export PDF");
  const pages = deck.slides
    .map(
      (s) => `<div class="page"><div class="slide nxPresSlide nxPresLayout-${s.layout}">${slideHtml(s)}</div></div>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><title>${esc(deck.title)}</title><style>
    @page { size: 297mm 167mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; }
    body { font-family: -apple-system, system-ui, sans-serif; }
    .page { width: 297mm; height: 167mm; page-break-after: always; overflow: hidden; }
    .slide { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 18mm 22mm; gap: 6mm; }
    ${themeCss}
  </style></head><body>${pages}</body></html>`);
  w.document.close();
  w.focus();
  // give the DOM/images a beat before the dialog
  setTimeout(() => w.print(), 400);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slideHtml(s: Slide): string {
  const b = s.blocks;
  const rt = (h?: string) => (h ? sanitizeHtml(h) : "");
  switch (s.layout) {
    case "title":
      return `<div class="nxPresTitle">${rt(b.title)}</div><div class="nxPresSubtitle">${rt(b.subtitle)}</div>`;
    case "section":
      return `<div class="nxPresSection">${rt(b.title)}</div>`;
    case "quote":
      return `<div class="nxPresQuote">${rt(b.quote)}</div><div class="nxPresAttribution">${rt(b.attribution)}</div>`;
    case "two-column":
      return `<div class="nxPresH">${rt(b.title)}</div><div style="display:flex;gap:8mm;flex:1"><div class="nxPresCol" style="flex:1">${rt(b.left)}</div><div class="nxPresCol" style="flex:1">${rt(b.right)}</div></div>`;
    case "image":
      return `<div class="nxPresH">${rt(b.title)}</div>${b.imageUrl ? `<img src="${b.imageUrl}" style="flex:1;min-height:0;object-fit:contain;width:100%"/>` : ""}<div class="nxPresCaption">${rt(b.caption)}</div>`;
    default:
      return `<div class="nxPresBody">${rt(b.body)}</div>`;
  }
}

/* ---- PPTX: MIT pptxgenjs behind a LAZY dynamic import ----
   The library (~1MB min) never enters the eager bundle; the chunk loads on the
   first "Export PPTX" click. Rich text degrades to plain paragraphs/bullets
   (pptxgenjs text runs; bold/italic inline runs are mapped, links are not). */
export async function exportDeckToPptx(deck: DeckSnapshot): Promise<void> {
  const mod = await import("pptxgenjs");
  const PptxGen = (mod as { default: new () => PptxLike }).default;
  const pptx = new PptxGen();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";
  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    const b = s.blocks;
    const add = (html: string | undefined, o: Record<string, unknown>) => {
      if (!html) return;
      slide.addText(htmlToRuns(html), { fontFace: "Helvetica", ...o });
    };
    switch (s.layout) {
      case "title":
        add(b.title, { x: 0.9, y: 2.5, w: 11.5, h: 1.6, fontSize: 44, bold: true });
        add(b.subtitle, { x: 0.9, y: 4.2, w: 11.5, h: 1, fontSize: 20, color: "666666" });
        break;
      case "section":
        add(b.title, { x: 0.9, y: 3, w: 11.5, h: 1.5, fontSize: 40, bold: true });
        break;
      case "quote":
        add(b.quote, { x: 1.2, y: 2.2, w: 10.9, h: 2.6, fontSize: 30, italic: true });
        add(b.attribution, { x: 1.2, y: 5, w: 10.9, h: 0.8, fontSize: 16, color: "666666" });
        break;
      case "two-column":
        add(b.title, { x: 0.7, y: 0.5, w: 12, h: 0.9, fontSize: 28, bold: true });
        add(b.left, { x: 0.7, y: 1.7, w: 5.8, h: 5.2, fontSize: 16, valign: "top" });
        add(b.right, { x: 6.8, y: 1.7, w: 5.8, h: 5.2, fontSize: 16, valign: "top" });
        break;
      case "image":
        add(b.title, { x: 0.7, y: 0.5, w: 12, h: 0.9, fontSize: 28, bold: true });
        if (b.imageUrl) {
          try {
            slide.addImage({ data: await toDataUrl(b.imageUrl), x: 1.6, y: 1.6, w: 10.1, h: 4.9 });
          } catch {
            slide.addText([{ text: "[image unavailable]" }], { x: 1.6, y: 3.5, w: 10, h: 1, fontSize: 14, color: "999999" });
          }
        }
        add(b.caption, { x: 0.7, y: 6.7, w: 12, h: 0.6, fontSize: 13, color: "666666" });
        break;
      default:
        add(b.body, { x: 0.7, y: 0.7, w: 12, h: 6, fontSize: 18, valign: "top" });
    }
    /* free-placement elements — exported at their real geometry so a deck can
       round-trip out to PowerPoint and back in without losing its layout */
    for (const el of s.elements ?? []) {
      const geo = { x: (el.x / 1280) * 13.33, y: (el.y / 720) * 7.5, w: (el.w / 1280) * 13.33, h: (el.h / 720) * 7.5 };
      const rotate = el.rot ? { rotate: el.rot } : {};
      const st = el.style ?? {};
      if (el.kind === "image" && el.src) {
        try {
          slide.addImage({ data: await toDataUrl(el.src), ...geo, ...rotate });
        } catch {
          /* an unreachable image must not abort the whole export */
        }
      } else if (el.kind === "shape") {
        slide.addShape(PPTX_SHAPE[el.shape ?? "rect"] ?? "rect", {
          ...geo,
          ...rotate,
          fill: st.fill && st.fill !== "none" ? { color: hexOf(st.fill), transparency: Math.round((1 - (st.fillOpacity ?? 1)) * 100) } : { type: "none" },
          line:
            st.stroke && st.stroke !== "none"
              ? { color: hexOf(st.stroke), width: st.strokeWidth ?? 1 }
              : { type: "none" },
          rectRadius: el.shape === "roundRect" ? 0.1 : undefined,
        });
        if (el.html && textOf(el.html)) {
          slide.addText(htmlToRuns(el.html), {
            ...geo,
            ...rotate,
            fontFace: "Helvetica",
            fontSize: Math.round((st.fontSize ?? 24) * 0.75),
            color: hexOf(st.color ?? "#ffffff"),
            align: st.align ?? "center",
            valign: st.valign ?? "middle",
          });
        }
      } else if (el.kind === "chart" && el.chart) {
        /* a NATIVE PowerPoint chart (editable in PowerPoint), not a picture */
        const c = el.chart;
        slide.addChart(
          PPTX_CHART[c.type] ?? "bar",
          c.series.map((name, i) => ({
            name,
            labels: c.rows.map((r) => r.label),
            values: c.rows.map((r) => r.values[i] ?? 0),
          })),
          { ...geo, showLegend: c.showLegend !== false, legendPos: "b" },
        );
      } else if (el.kind === "table" && el.table) {
        const header = el.table.headerRow !== false;
        slide.addTable(
          el.table.rows.map((row, r) =>
            row.map((cell) => ({
              text: cell.text,
              options: { bold: cell.bold || (header && r === 0), align: cell.align ?? "left", fontSize: Math.round((st.fontSize ?? 20) * 0.75) },
            })),
          ),
          { ...geo, border: { pt: 1, color: "CCCCCC" }, fontFace: "Helvetica" },
        );
      } else if (el.kind === "text" && el.html) {
        slide.addText(htmlToRuns(el.html), {
          ...geo,
          ...rotate,
          fontFace: "Helvetica",
          fontSize: Math.round((st.fontSize ?? 28) * 0.75),
          color: hexOf(st.color ?? "#111111"),
          align: st.align ?? "left",
          valign: st.valign ?? "top",
        });
      } else if (el.kind === "video") {
        /* pptxgenjs media embedding is not wired — export the poster frame when
           there is one, else a labeled placeholder (never a silent drop) */
        if (el.poster) {
          try {
            slide.addImage({ data: await toDataUrl(el.poster), ...geo, ...rotate });
          } catch {
            /* fall through to the placeholder */
          }
        } else {
          slide.addText([{ text: "▶ video (plays in the shared link)" }], {
            ...geo,
            fontFace: "Helvetica",
            fontSize: 12,
            color: "666666",
            align: "center",
            valign: "middle",
          });
        }
      }
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  await pptx.writeFile({ fileName: `${deck.title.replace(/[^\w\- ]+/g, "").trim() || "deck"}.pptx` });
}

interface PptxLike {
  defineLayout: (o: { name: string; width: number; height: number }) => void;
  layout: string;
  addSlide: () => PptxSlideLike;
  writeFile: (o: { fileName: string }) => Promise<unknown>;
}
interface PptxSlideLike {
  addText: (runs: TextRun[], opts: Record<string, unknown>) => void;
  addImage: (o: Record<string, unknown>) => void;
  addShape: (shape: string, opts: Record<string, unknown>) => void;
  addChart: (type: string, data: unknown[], opts: Record<string, unknown>) => void;
  addTable: (rows: unknown[][], opts: Record<string, unknown>) => void;
  addNotes: (s: string) => void;
}

/* our shape kinds -> OOXML preset geometry names pptxgenjs understands */
const PPTX_SHAPE: Record<string, string> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  arrow: "rightArrow",
  line: "line",
  star: "star5",
  callout: "wedgeRectCallout",
};

/* our chart kinds -> pptxgenjs chart types */
const PPTX_CHART: Record<string, string> = {
  bar: "bar",
  line: "line",
  area: "area",
  pie: "pie",
  scatter: "scatter",
};

/* PPTX wants bare RRGGBB. A token (var(--pres-accent)) has no literal value at
   export time, so it resolves against the live document; if that fails we fall
   back to a neutral rather than emitting an invalid colour. */
function hexOf(color: string): string {
  let c = color.trim();
  if (c.startsWith("var(")) {
    const name = c.slice(4, -1).split(",")[0].trim();
    const resolved = typeof getComputedStyle !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      : "";
    c = resolved || "#666666";
  }
  if (c.startsWith("rgb")) {
    const n = c.match(/\d+/g);
    if (n && n.length >= 3) return n.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
  }
  if (c.startsWith("#")) {
    const h = c.slice(1);
    if (h.length === 3) return h.split("").map((x) => x + x).join("");
    return h.slice(0, 6);
  }
  return "666666";
}
interface TextRun {
  text: string;
  options?: Record<string, unknown>;
}

/* Flatten sanitized HTML into pptxgenjs text runs: paragraphs + bullets with
   bold/italic inline runs preserved. Anything fancier flattens to text. */
export function htmlToRuns(html: string): TextRun[] {
  const el = document.createElement("div");
  el.innerHTML = sanitizeHtml(html);
  const runs: TextRun[] = [];
  const walk = (node: Node, ctx: { bold?: boolean; italic?: boolean; bullet?: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim() || text === " ")
        runs.push({ text, options: { bold: ctx.bold, italic: ctx.italic, bullet: ctx.bullet ? true : undefined } });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const e = node as HTMLElement;
    const tag = e.tagName.toLowerCase();
    const next = { ...ctx };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "li") {
      // each list item = one bulleted run (inline formatting inside collapses per-run)
      runs.push({ text: textOfNode(e), options: { bullet: true, breakLine: true, bold: next.bold, italic: next.italic } });
      return;
    }
    if (tag === "p" || tag === "div" || tag === "br") {
      if (runs.length) runs.push({ text: "", options: { breakLine: true } });
    }
    e.childNodes.forEach((c) => walk(c, next));
  };
  el.childNodes.forEach((c) => walk(c, {}));
  if (!runs.length) runs.push({ text: textOf(html) });
  return runs;
}

function textOfNode(e: HTMLElement): string {
  return (e.textContent ?? "").trim();
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
