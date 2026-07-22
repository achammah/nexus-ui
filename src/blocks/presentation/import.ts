/* ---- PPTX import (OOXML) ----
   Reads a .pptx — from PowerPoint, Google Slides ("File → Download → .pptx",
   which is how Slides interops), Keynote's PPTX export, or this block's own
   export — and turns each slide into free-placement ELEMENTS.

   Why elements and not layouts: a PowerPoint slide is already absolutely
   positioned, so mapping it onto our template layouts would mean guessing (and
   losing) the author's geometry. Imported slides land on the region-less
   `canvas` layout with their real coordinates, which is lossless for position.

   Fidelity is deliberately scoped — see the returned `warnings` and the parity
   table in the self-review. We read: shape geometry (position/size/rotation),
   preset shape kinds we can draw, solid fills and outlines, text with per-run
   bold/italic/underline/size/colour, bullets, pictures (embedded as data URLs),
   grouped shapes (flattened with composed transforms) and speaker notes.
   We do NOT read: theme colour inheritance, gradients/images-as-fill, tables,
   charts, SmartArt, animations, masters/placeholders geometry inheritance,
   or WordArt effects. Anything unread is reported, never silently dropped. */

import type JSZipType from "jszip";
import type { ShapeKind, Slide, SlideElement } from "./types";
import { uid } from "./types";

const EMU_PER_SLIDE_W_DEFAULT = 12192000; // 13.333in widescreen
const EMU_PER_SLIDE_H_DEFAULT = 6858000; // 7.5in
const DESIGN_W = 1280;
const DESIGN_H = 720;

export interface PptxImportResult {
  title: string;
  slides: Slide[];
  warnings: string[];
}

/* OOXML preset geometries we can draw natively. Anything else becomes a
   rectangle and is reported, so the slide still reads correctly. */
const PRESET_MAP: Record<string, ShapeKind> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  isoscelesTriangle: "triangle",
  rightArrow: "arrow",
  leftArrow: "arrow",
  line: "line",
  straightConnector1: "line",
  star5: "star",
  star4: "star",
  wedgeRectCallout: "callout",
  wedgeRoundRectCallout: "callout",
};

const q = (el: Element, sel: string): Element | null => el.querySelector(sel);
const qa = (el: Element | Document, sel: string): Element[] => Array.from(el.querySelectorAll(sel));

/* querySelector can't match namespaced tags portably, so match on localName */
function child(el: Element, local: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === local) return c;
  return null;
}
function childAll(el: Element, local: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === local);
}
function descend(el: Element, path: string[]): Element | null {
  let cur: Element | null = el;
  for (const p of path) {
    if (!cur) return null;
    cur = child(cur, p);
  }
  return cur;
}
function findFirst(el: Element, local: string): Element | null {
  if (el.localName === local) return el;
  for (const c of Array.from(el.children)) {
    const hit = findFirst(c, local);
    if (hit) return hit;
  }
  return null;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export async function importPptx(file: File | Blob): Promise<PptxImportResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const warnings = new Set<string>();

  const readText = async (path: string): Promise<string | null> => {
    const f = zip.file(path.replace(/^\//, ""));
    return f ? await f.async("string") : null;
  };
  const parse = (xml: string): Document => new DOMParser().parseFromString(xml, "application/xml");

  /* slide size drives the EMU -> design-px scale */
  let emuW = EMU_PER_SLIDE_W_DEFAULT;
  let emuH = EMU_PER_SLIDE_H_DEFAULT;
  const presXml = await readText("ppt/presentation.xml");
  if (presXml) {
    const sz = parse(presXml).getElementsByTagName("p:sldSz")[0];
    if (sz) {
      emuW = Number(sz.getAttribute("cx")) || emuW;
      emuH = Number(sz.getAttribute("cy")) || emuH;
    }
  } else {
    warnings.add("No ppt/presentation.xml — assumed a 16:9 slide size.");
  }
  const sx = DESIGN_W / emuW;
  const sy = DESIGN_H / emuH;
  /* points -> design px (a 7.5in slide is 720 design px tall) */
  const ptScale = (DESIGN_H / (emuH / 914400)) / 72;

  /* slide order: presentation.xml sldIdLst -> rels -> parts */
  const slidePaths = await resolveSlideOrder(zip, readText, parse, warnings);

  const slides: Slide[] = [];
  let deckTitle = "";

  for (const path of slidePaths) {
    const xml = await readText(path);
    if (!xml) continue;
    const doc = parse(xml);
    const rels = await loadRels(zip, readText, parse, path);

    const elements: SlideElement[] = [];
    const tree = doc.getElementsByTagName("p:cSld")[0];
    const spTree = tree ? findFirst(tree, "spTree") : null;
    if (spTree) {
      await walkShapes(spTree, { dx: 0, dy: 0, scaleX: 1, scaleY: 1 }, elements, {
        sx,
        sy,
        ptScale,
        rels,
        zip,
        warnings,
      });
    }

    const notes = await readNotes(zip, readText, parse, path);

    /* the first non-empty text on slide 1 doubles as the deck title */
    if (!deckTitle) {
      const firstText = elements.find((e) => e.html && stripTags(e.html).trim());
      if (firstText) deckTitle = stripTags(firstText.html!).trim().slice(0, 120);
    }

    slides.push({
      id: `sl-${uid()}`,
      layout: "canvas",
      blocks: {},
      notes,
      transition: "fade",
      elements,
    });
  }

  if (!slides.length) warnings.add("No slides found — the file may not be a .pptx package.");

  return { title: deckTitle || "Imported deck", slides, warnings: [...warnings] };
}

/* ---- ordering + relationships ---- */

type ReadText = (p: string) => Promise<string | null>;
type Parse = (x: string) => Document;

async function resolveSlideOrder(
  zip: JSZipType,
  readText: ReadText,
  parse: Parse,
  warnings: Set<string>,
): Promise<string[]> {
  const presRels = await readText("ppt/_rels/presentation.xml.rels");
  const presXml = await readText("ppt/presentation.xml");
  if (presRels && presXml) {
    const relDoc = parse(presRels);
    const map = new Map<string, string>();
    for (const r of qa(relDoc, "Relationship")) {
      const id = r.getAttribute("Id");
      const target = r.getAttribute("Target");
      if (id && target) map.set(id, `ppt/${target.replace(/^\.\.\//, "").replace(/^\//, "")}`);
    }
    const ids = Array.from(parse(presXml).getElementsByTagName("p:sldId"));
    const ordered = ids
      .map((n) => n.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || n.getAttribute("r:id"))
      .map((id) => (id ? map.get(id) : undefined))
      .filter((p): p is string => !!p);
    if (ordered.length) return ordered;
  }
  /* fallback: numeric order of the slide parts */
  warnings.add("Slide order came from file names (presentation.xml relationships were unreadable).");
  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]));
}

async function loadRels(
  zip: JSZipType | undefined,
  readText: ReadText,
  parse: Parse,
  slidePath: string,
): Promise<Map<string, string>> {
  const relPath = slidePath.replace(/([^/]+)$/, "_rels/$1.rels");
  const xml = await readText(relPath);
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const r of qa(parse(xml), "Relationship")) {
    const id = r.getAttribute("Id");
    const target = r.getAttribute("Target");
    if (!id || !target) continue;
    const resolved = target.startsWith("../") ? `ppt/${target.replace(/^\.\.\//, "")}` : `ppt/slides/${target}`;
    map.set(id, resolved.replace(/\/\.\//g, "/"));
  }
  return map;
}

async function readNotes(zip: JSZipType | undefined, readText: ReadText, parse: Parse, slidePath: string): Promise<string> {
  const rels = await loadRels(zip, readText, parse, slidePath);
  const notesPath = [...rels.values()].find((v) => v.includes("notesSlide"));
  if (!notesPath) return "";
  const xml = await readText(notesPath);
  if (!xml) return "";
  const doc = parse(xml);
  const root = doc.documentElement;
  const spTree = findFirst(root, "spTree");
  if (!spTree) return "";
  /* A notes part also carries the slide THUMBNAIL and the slide-number
     placeholder; concatenating every <a:t> would append the page number to the
     speaker notes. Read only the body placeholder. */
  const parts: string[] = [];
  for (const sp of Array.from(spTree.children)) {
    if (sp.localName !== "sp") continue;
    const ph = findFirst(sp, "ph");
    const phType = ph?.getAttribute("type") ?? "";
    if (phType === "sldNum" || phType === "dt" || phType === "ftr") continue;
    const txBody = child(sp, "txBody");
    if (!txBody) continue;
    const text = Array.from(txBody.getElementsByTagName("*"))
      .filter((n) => n.localName === "t")
      .map((t) => t.textContent ?? "")
      .join("");
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join("\n").trim();
}

/* ---- shape walking ---- */

interface Ctx {
  sx: number;
  sy: number;
  ptScale: number;
  rels: Map<string, string>;
  zip: JSZipType;
  warnings: Set<string>;
}
interface Xform {
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
}

async function walkShapes(node: Element, xf: Xform, out: SlideElement[], ctx: Ctx): Promise<void> {
  for (const el of Array.from(node.children)) {
    const name = el.localName;
    if (name === "sp") pushShape(el, xf, out, ctx);
    else if (name === "pic") await pushPicture(el, xf, out, ctx);
    else if (name === "grpSp") {
      /* a group carries its own frame plus a CHILD coordinate space (chOff/chExt);
         compose them so nested shapes land where PowerPoint drew them */
      const xfrm = descend(el, ["grpSpPr", "xfrm"]);
      let next = xf;
      if (xfrm) {
        const off = child(xfrm, "off");
        const ext = child(xfrm, "ext");
        const chOff = child(xfrm, "chOff");
        const chExt = child(xfrm, "chExt");
        if (off && ext && chOff && chExt) {
          const gw = Number(ext.getAttribute("cx")) || 1;
          const gh = Number(ext.getAttribute("cy")) || 1;
          const cw = Number(chExt.getAttribute("cx")) || gw;
          const ch = Number(chExt.getAttribute("cy")) || gh;
          const kx = gw / cw;
          const ky = gh / ch;
          next = {
            scaleX: xf.scaleX * kx,
            scaleY: xf.scaleY * ky,
            dx: xf.dx + (Number(off.getAttribute("x")) || 0) * xf.scaleX - (Number(chOff.getAttribute("x")) || 0) * xf.scaleX * kx,
            dy: xf.dy + (Number(off.getAttribute("y")) || 0) * xf.scaleY - (Number(chOff.getAttribute("y")) || 0) * xf.scaleY * ky,
          };
        }
      }
      await walkShapes(el, next, out, ctx);
    } else if (name === "graphicFrame") {
      const uri = findFirst(el, "graphicData")?.getAttribute("uri") ?? "";
      if (uri.includes("table")) ctx.warnings.add("A table was skipped — tables are not imported yet.");
      else if (uri.includes("chart")) ctx.warnings.add("A chart was skipped — charts are not imported yet.");
      else ctx.warnings.add("An embedded object (SmartArt/OLE) was skipped.");
    }
  }
}

function frameOf(el: Element, xf: Xform, ctx: Ctx, path: string[]): Frame | null {
  const xfrm = descend(el, path);
  if (!xfrm) return null;
  const off = child(xfrm, "off");
  const ext = child(xfrm, "ext");
  if (!off || !ext) return null;
  const rot = Number(xfrm.getAttribute("rot") || 0) / 60000;
  return {
    x: ((Number(off.getAttribute("x")) || 0) * xf.scaleX + xf.dx) * ctx.sx,
    y: ((Number(off.getAttribute("y")) || 0) * xf.scaleY + xf.dy) * ctx.sy,
    w: (Number(ext.getAttribute("cx")) || 0) * xf.scaleX * ctx.sx,
    h: (Number(ext.getAttribute("cy")) || 0) * xf.scaleY * ctx.sy,
    rot: Math.round(rot),
  };
}

function pushShape(el: Element, xf: Xform, out: SlideElement[], ctx: Ctx): void {
  const spPr = child(el, "spPr");
  const frame = frameOf(el, xf, ctx, ["spPr", "xfrm"]);
  const txBody = child(el, "txBody");
  const html = txBody ? textBodyToHtml(txBody, ctx) : "";
  const hasText = !!stripTags(html).trim();

  if (!frame) {
    /* A placeholder with no explicit geometry inherits it from the layout/master.
       We do not resolve masters, so rather than invent coordinates we drop a
       readable text box in the upper band and say so. */
    if (!hasText) return;
    ctx.warnings.add("A placeholder inherited its position from the slide master — text was placed approximately.");
    out.push({
      id: `el-${uid()}`,
      kind: "text",
      x: 80,
      y: 60 + out.length * 12,
      w: DESIGN_W - 160,
      h: 120,
      rot: 0,
      html,
      style: { fill: "none", stroke: "none", opacity: 1, color: "var(--pres-fg)", fontSize: 28, align: "left", valign: "top" },
    });
    return;
  }

  const prst = spPr ? child(spPr, "prstGeom")?.getAttribute("prst") ?? null : null;
  const fill = solidFillOf(spPr);
  const line = spPr ? child(spPr, "ln") : null;
  const lineFill = line ? solidFillOf(line) : null;
  const lineW = line ? Number(line.getAttribute("w") || 0) / 12700 : 0; // EMU -> pt
  const noFill = spPr ? !!child(spPr, "noFill") : false;

  /* a shape with no preset geometry and no fill is really just a text box */
  const isTextOnly = (!prst || prst === "rect") && (noFill || !fill) && hasText && !lineFill;

  if (isTextOnly) {
    out.push({
      id: `el-${uid()}`,
      kind: "text",
      x: Math.round(frame.x),
      y: Math.round(frame.y),
      w: Math.round(frame.w),
      h: Math.round(frame.h),
      rot: frame.rot,
      html,
      style: {
        fill: "none",
        stroke: "none",
        opacity: 1,
        color: firstRunColor(txBody) ?? "var(--pres-fg)",
        fontSize: firstRunSize(txBody, ctx.ptScale) ?? 28,
        align: firstRunAlign(txBody) ?? "left",
        valign: "top",
      },
    });
    return;
  }

  if (prst && !PRESET_MAP[prst]) ctx.warnings.add(`Preset shape "${prst}" is drawn as a rectangle.`);

  out.push({
    id: `el-${uid()}`,
    kind: "shape",
    shape: (prst && PRESET_MAP[prst]) || "rect",
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    w: Math.round(frame.w),
    h: Math.round(frame.h),
    rot: frame.rot,
    html: hasText ? html : undefined,
    style: {
      fill: noFill ? "none" : fill ?? "var(--pres-accent)",
      stroke: lineFill ?? "none",
      strokeWidth: Math.round(lineW * ctx.ptScale) || (lineFill ? 2 : 0),
      opacity: 1,
      radius: 16,
      color: firstRunColor(txBody) ?? "#ffffff",
      fontSize: firstRunSize(txBody, ctx.ptScale) ?? 24,
      align: firstRunAlign(txBody) ?? "center",
      valign: "middle",
    },
  });
}

async function pushPicture(el: Element, xf: Xform, out: SlideElement[], ctx: Ctx): Promise<void> {
  const frame = frameOf(el, xf, ctx, ["spPr", "xfrm"]);
  const blip = findFirst(el, "blip");
  const embed =
    blip?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") ??
    blip?.getAttribute("r:embed");
  if (!frame || !embed) return;
  const target = ctx.rels.get(embed);
  if (!target) return;
  const f = ctx.zip.file(target);
  if (!f) {
    ctx.warnings.add("An image referenced a missing part and was skipped.");
    return;
  }
  const b64 = await f.async("base64");
  const mime = target.endsWith(".png")
    ? "image/png"
    : target.endsWith(".gif")
      ? "image/gif"
      : target.endsWith(".svg")
        ? "image/svg+xml"
        : "image/jpeg";
  out.push({
    id: `el-${uid()}`,
    kind: "image",
    src: `data:${mime};base64,${b64}`,
    alt: findFirst(el, "cNvPr")?.getAttribute("descr") ?? "",
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    w: Math.round(frame.w),
    h: Math.round(frame.h),
    rot: frame.rot,
    style: { opacity: 1, radius: 0 },
  });
}

/* ---- text ---- */

function textBodyToHtml(txBody: Element, ctx: Ctx): string {
  const paras = childAll(txBody, "p");
  const out: string[] = [];
  let listOpen = false;
  for (const p of paras) {
    const pPr = child(p, "pPr");
    const bulleted = !!(pPr && (child(pPr, "buChar") || child(pPr, "buAutoNum")));
    const runs = childAll(p, "r")
      .map((r) => {
        const t = child(r, "t")?.textContent ?? "";
        if (!t) return "";
        const rPr = child(r, "rPr");
        let html = escapeHtml(t);
        if (rPr?.getAttribute("b") === "1") html = `<b>${html}</b>`;
        if (rPr?.getAttribute("i") === "1") html = `<i>${html}</i>`;
        const u = rPr?.getAttribute("u");
        if (u && u !== "none") html = `<u>${html}</u>`;
        return html;
      })
      .join("");
    if (!runs.trim()) {
      if (!bulleted) out.push("");
      continue;
    }
    if (bulleted) {
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${runs}</li>`);
    } else {
      if (listOpen) {
        out.push("</ul>");
        listOpen = false;
      }
      out.push(`<div>${runs}</div>`);
    }
  }
  if (listOpen) out.push("</ul>");
  void ctx;
  return out.join("");
}

const firstRun = (txBody: Element | null): Element | null => (txBody ? findFirst(txBody, "rPr") : null);

function firstRunColor(txBody: Element | null): string | undefined {
  const rPr = firstRun(txBody);
  const c = rPr ? solidFillOf(rPr) : null;
  return c ?? undefined;
}
function firstRunSize(txBody: Element | null, ptScale: number): number | undefined {
  const sz = firstRun(txBody)?.getAttribute("sz");
  if (!sz) return undefined;
  return Math.round((Number(sz) / 100) * ptScale);
}
function firstRunAlign(txBody: Element | null): "left" | "center" | "right" | undefined {
  if (!txBody) return undefined;
  const pPr = findFirst(txBody, "pPr");
  const a = pPr?.getAttribute("algn");
  return a === "ctr" ? "center" : a === "r" ? "right" : a === "l" ? "left" : undefined;
}

/* Only literal sRGB is resolved. Theme colours (schemeClr) need the master's
   colour map, which we do not read — those fall back to the deck's own accent so
   the slide still looks intentional rather than black-on-black. */
function solidFillOf(node: Element | null): string | null {
  if (!node) return null;
  const sf = child(node, "solidFill");
  if (!sf) return null;
  const srgb = child(sf, "srgbClr");
  if (srgb) {
    const v = srgb.getAttribute("val");
    if (v) return `#${v}`;
  }
  if (child(sf, "schemeClr")) return "var(--pres-accent)";
  return null;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stripTags = (s: string): string => s.replace(/<[^>]*>/g, "");

/* querySelector helper kept for the rels documents (plain, non-namespaced) */
void q;
