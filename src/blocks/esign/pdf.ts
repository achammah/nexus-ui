// Lazy pdf engines for the e-sign block. Loaded ONLY inside the surface chunk:
// pdfjs-dist (Apache-2.0) renders pages to canvas; pdf-lib (MIT) flattens the
// completed envelope's field values onto a downloadable PDF.
import type { EsignDocument, EsignEnvelope, EsignField } from "./snapshot";

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* ------------------------------------------------------------------- pdfjs */

export interface PdfPageHandle {
  index: number;
  /** CSS-pixel size at scale 1 (PDF points) */
  width: number;
  height: number;
  render: (canvas: HTMLCanvasElement, scale: number) => Promise<void>;
  /** abort an in-flight render for this canvas (unmount, page swap) */
  cancel: (canvas: HTMLCanvasElement) => void;
}

export interface PdfDocHandle {
  pageCount: number;
  getPage: (index: number) => Promise<PdfPageHandle>;
  destroy: () => void;
}

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

/* One canvas may be asked to re-render before its previous render finished —
   zoom changes, fit-width on resize, page swaps. Two pdfjs render tasks sharing
   a canvas corrupt the 2D transform state and paint the page MIRRORED, so a
   canvas may only ever have one live task: cancel the old one and let it settle
   before starting the next. */
const liveRenders = new WeakMap<HTMLCanvasElement, { cancel: () => void; done: Promise<void> }>();

async function renderExclusive(
  canvas: HTMLCanvasElement,
  start: () => { promise: Promise<void>; cancel: () => void },
): Promise<void> {
  const prev = liveRenders.get(canvas);
  if (prev) {
    prev.cancel();
    await prev.done; // resolves (never rejects) once the cancellation settles
  }
  const task = start();
  const done = task.promise.catch(() => { /* cancelled or superseded */ });
  // cancel() must stay bound to its task — pdfjs RenderTask uses private fields
  liveRenders.set(canvas, { cancel: () => task.cancel(), done });
  await done;
  if (liveRenders.get(canvas)?.done === done) liveRenders.delete(canvas);
}

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

/** Open a document (PDF via pdfjs; a single image becomes one synthetic page). */
export async function openDocument(doc: EsignDocument): Promise<PdfDocHandle> {
  if (doc.mime.startsWith("image/")) {
    const img = new Image();
    img.src = `data:${doc.mime};base64,${doc.dataBase64}`;
    await img.decode();
    const page: PdfPageHandle = {
      index: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
      render: async (canvas, scale) => {
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        canvas.width = Math.round(img.naturalWidth * scale * dpr);
        canvas.height = Math.round(img.naturalHeight * scale * dpr);
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      },
      /* images paint synchronously — nothing to cancel */
      cancel: () => {},
    };
    return { pageCount: 1, getPage: async () => page, destroy: () => {} };
  }
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: base64ToBytes(doc.dataBase64) });
  const pdf = await task.promise;
  return {
    pageCount: pdf.numPages,
    getPage: async (index: number) => {
      const page = await pdf.getPage(index + 1);
      const vp1 = page.getViewport({ scale: 1 });
      return {
        index,
        width: vp1.width,
        height: vp1.height,
        render: async (canvas, scale) => {
          // The viewport stays at the CSS scale; the extra device pixels come
          // from an explicit transform (pdfjs's documented high-DPI recipe).
          const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale });
          canvas.width = Math.round(viewport.width * dpr);
          canvas.height = Math.round(viewport.height * dpr);
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          await renderExclusive(canvas, () =>
            page.render({
              canvasContext: ctx,
              viewport,
              transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
            }),
          );
        },
        cancel: (canvas) => liveRenders.get(canvas)?.cancel(),
      };
    },
    destroy: () => void pdf.destroy(),
  };
}

/** Probe a user-picked file: returns the normalized EsignDocument or throws. */
export async function fileToEsignDocument(file: File): Promise<EsignDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (mime !== "application/pdf" && !mime.startsWith("image/")) {
    throw new Error("Unsupported file type — load a PDF or an image (PNG/JPEG).");
  }
  const doc: EsignDocument = { name: file.name, mime, dataBase64: bytesToBase64(bytes), pageCount: 1 };
  const handle = await openDocument(doc);
  doc.pageCount = handle.pageCount;
  handle.destroy();
  return doc;
}

/* ------------------------------------------------------------------ flatten */

const TYPED_FONT_CSS = "32px 'Snell Roundhand','Segoe Script','Brush Script MT',cursive";

/** Render a typed signature to a PNG data URL (canvas text -> image), so the
 *  flattener embeds one code path for drawn/typed/uploaded alike. */
export function typedSignatureToDataUrl(text: string): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.font = TYPED_FONT_CSS;
  const w = Math.max(120, Math.ceil(ctx.measureText(text).width) + 32);
  canvas.width = w * 2;
  canvas.height = 96 * 2;
  const c2 = canvas.getContext("2d");
  if (!c2) return "";
  c2.scale(2, 2);
  c2.font = TYPED_FONT_CSS;
  c2.fillStyle = "#1c2733";
  c2.textBaseline = "middle";
  c2.fillText(text, 16, 48);
  return canvas.toDataURL("image/png");
}

/** Flatten every filled field onto the source PDF; returns the completed bytes.
 *  Images-as-documents are wrapped into a fresh single-page PDF first. */
export async function flattenEnvelope(env: EsignEnvelope): Promise<Uint8Array> {
  if (!env.document) throw new Error("No document to flatten");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  let pdf: import("pdf-lib").PDFDocument;
  if (env.document.mime.startsWith("image/")) {
    pdf = await PDFDocument.create();
    const bytes = base64ToBytes(env.document.dataBase64);
    const img = env.document.mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  } else {
    pdf = await PDFDocument.load(base64ToBytes(env.document.dataBase64));
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.11, 0.15, 0.2);
  for (const f of env.fields) {
    const v = f.value;
    if (!v) continue;
    const page = pdf.getPage(f.page);
    const { width: pw, height: ph } = page.getSize();
    const x = f.x * pw;
    const wf = f.w * pw;
    const hf = f.h * ph;
    const yTop = f.y * ph; // f.y is from page TOP; pdf-lib origin is bottom-left
    const y = ph - yTop - hf;
    if (v.type === "signature" || v.type === "initials") {
      const sig = v.signature;
      const dataUrl = sig.dataUrl || (sig.text ? typedSignatureToDataUrl(sig.text) : "");
      if (!dataUrl) continue;
      const b64 = dataUrl.split(",")[1] ?? "";
      const bytes = base64ToBytes(b64);
      const img = dataUrl.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      // fit, preserving aspect
      const ratio = Math.min(wf / img.width, hf / img.height);
      const iw = img.width * ratio;
      const ih = img.height * ratio;
      page.drawImage(img, { x: x + (wf - iw) / 2, y: y + (hf - ih) / 2, width: iw, height: ih });
    } else if (v.type === "checkbox") {
      if (v.checked) {
        const s = Math.min(wf, hf);
        page.drawText("X", { x: x + s * 0.2, y: y + s * 0.15, size: s * 0.9, font, color: ink });
      }
    } else {
      const size = Math.min(hf * 0.72, 12);
      page.drawText(v.text, { x: x + 2, y: y + (hf - size) / 2, size, font, color: ink });
    }
  }
  // completion certificate page
  const cert = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const soft = rgb(0.42, 0.45, 0.5);
  let cy = 792 - 88;
  cert.drawText("Completion Certificate", { x: 64, y: cy, size: 18, font: bold, color: ink }); cy -= 22;
  cert.drawText(`Envelope: ${env.name}  ·  Certificate ${env.certificateId ?? "(pending)"}`, { x: 64, y: cy, size: 10, font, color: soft }); cy -= 14;
  cert.drawText(`Document: ${env.document.name}`, { x: 64, y: cy, size: 10, font, color: soft }); cy -= 14;
  cert.drawText(`Completed: ${env.completedAt ?? "—"}`, { x: 64, y: cy, size: 10, font, color: soft }); cy -= 28;
  for (const s of env.signers) {
    cert.drawText(`${s.name} <${s.email}> — ${s.role}`, { x: 64, y: cy, size: 11, font: bold, color: ink }); cy -= 15;
    cert.drawText(`viewed ${s.viewedAt ?? "—"}   signed ${s.signedAt ?? "—"}   fields ${env.fields.filter((x2) => x2.signerId === s.id && x2.value).length}`, { x: 64, y: cy, size: 9.5, font, color: soft }); cy -= 22;
  }
  cert.drawText("Demo surface — this certificate documents the demo signing flow; it is not a claim of legal validity.", { x: 64, y: 64, size: 8.5, font, color: soft });
  return pdf.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Field helper shared by viewer + flatten: pixel rect at a rendered size. */
export function fieldRect(f: EsignField, pageW: number, pageH: number) {
  return { left: f.x * pageW, top: f.y * pageH, width: f.w * pageW, height: f.h * pageH };
}

/* --------------------------------------------------- drafting: blocks -> pdf */

type DocBlock = import("../document/snapshot").DocumentSnapshot["blocks"][number];

/** Strip the editor's inline mark syntax to plain segments, keeping BOLD as a
 *  flag (the one mark worth carrying into the frozen render). Everything else
 *  (links, highlight, underline, code) flattens to its text. */
function inlineSegments(text: string): Array<{ text: string; bold: boolean }> {
  const cleaned = text
    .replace(/\[\[[ch]:[a-z]+\|([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(==|\+\+|~~|`)/g, "");
  const segs: Array<{ text: string; bold: boolean }> = [];
  let bold = false;
  for (const part of cleaned.split(/\*\*/)) {
    if (part) segs.push({ text: part, bold });
    bold = !bold;
  }
  return segs.length ? segs : [{ text: "", bold: false }];
}

/** Render a document-block draft to real PDF bytes (the FREEZE step of the
 *  drafting -> preparing transition). Print-class fidelity on our own layout:
 *  headings, paragraphs, lists, todos, quotes, callouts, code, dividers and
 *  simple tables paginate over US-Letter pages. It is deliberately NOT a
 *  Word-identical renderer — that boundary is surfaced in the UI. */
export async function blocksToPdfBytes(blocks: DocBlock[], title: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const ink = rgb(0.11, 0.15, 0.2);
  const soft = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.78, 0.8, 0.83);
  const W = 612, H = 792, M = 64;
  let page = pdf.addPage([W, H]);
  let y = H - 76;
  const pageNum = () => pdf.getPageCount();
  const need = (h: number) => {
    if (y - h < 56) {
      page.drawText(`Page ${pageNum()}`, { x: W / 2 - 18, y: 40, size: 9, font, color: soft });
      page = pdf.addPage([W, H]);
      y = H - 76;
    }
  };
  /** wrap + draw mixed bold/regular segments; returns nothing, advances y */
  const drawRich = (segs: Array<{ text: string; bold: boolean }>, size: number, opts?: { x?: number; color?: ReturnType<typeof rgb>; lh?: number; useFont?: typeof font }) => {
    const x0 = opts?.x ?? M;
    const lh = opts?.lh ?? size * 1.45;
    const color = opts?.color ?? ink;
    const maxW = W - M - x0;
    // tokenize into words carrying their bold flag
    const words: Array<{ w: string; b: boolean }> = [];
    for (const s of segs) for (const w of s.text.split(/\s+/)) if (w) words.push({ w, b: s.bold });
    if (!words.length) { y -= lh; return; }
    let lineWords: Array<{ w: string; b: boolean }> = [];
    const widthOf = (ws: typeof lineWords) =>
      ws.reduce((acc, t, i) => acc + (t.b ? bold : (opts?.useFont ?? font)).widthOfTextAtSize((i ? " " : "") + t.w, size), 0);
    const flush = () => {
      need(lh);
      let cx = x0;
      lineWords.forEach((t, i) => {
        const f = t.b ? bold : (opts?.useFont ?? font);
        const txt = (i ? " " : "") + t.w;
        page.drawText(txt, { x: cx, y, size, font: f, color });
        cx += f.widthOfTextAtSize(txt, size);
      });
      y -= lh;
      lineWords = [];
    };
    for (const t of words) {
      if (lineWords.length && widthOf([...lineWords, t]) > maxW) flush();
      lineWords.push(t);
    }
    if (lineWords.length) flush();
  };

  if (title) { need(30); drawRich([{ text: title, bold: true }], 19, { lh: 30 }); y -= 8; }
  let olCounter = 0;
  for (const b of blocks) {
    if (b.type !== "ol") olCounter = 0;
    switch (b.type) {
      case "h1": y -= 6; drawRich(inlineSegments(b.text).map((s) => ({ ...s, bold: true })), 16, { lh: 24 }); break;
      case "h2": y -= 5; drawRich(inlineSegments(b.text).map((s) => ({ ...s, bold: true })), 13.5, { lh: 21 }); break;
      case "h3": y -= 4; drawRich(inlineSegments(b.text).map((s) => ({ ...s, bold: true })), 12, { lh: 19 }); break;
      case "p": drawRich(inlineSegments(b.text), 10.5); y -= 4; break;
      case "quote": {
        const yTop = y;
        drawRich(inlineSegments(b.text), 10.5, { x: M + 14, color: soft });
        page.drawLine({ start: { x: M + 4, y: yTop + 10 }, end: { x: M + 4, y: y + 6 }, thickness: 2, color: line });
        y -= 4; break;
      }
      case "callout": drawRich([{ text: `${("emoji" in b && b.emoji) || "💡"} `, bold: false }, ...inlineSegments(b.text)], 10.5, { x: M + 10 }); y -= 4; break;
      case "ul": need(15); page.drawText("•", { x: M + 6, y, size: 10.5, font, color: ink }); drawRich(inlineSegments(b.text), 10.5, { x: M + 18 }); break;
      case "ol": { olCounter++; need(15); page.drawText(`${olCounter}.`, { x: M + 4, y, size: 10.5, font, color: ink }); drawRich(inlineSegments(b.text), 10.5, { x: M + 20 }); break; }
      case "todo": { need(15); const box = ("checked" in b && b.checked) ? "[x]" : "[ ]"; page.drawText(box, { x: M + 2, y, size: 10, font: mono, color: soft }); drawRich(inlineSegments(b.text), 10.5, { x: M + 24 }); break; }
      case "toggle": drawRich([{ text: "▸ ", bold: false }, ...inlineSegments(b.text)], 10.5); break;
      case "code": for (const ln of (b.text || "").split("\n")) drawRich([{ text: ln || " ", bold: false }], 9, { useFont: mono, lh: 13 }); y -= 4; break;
      case "divider": need(16); page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 1, color: line }); y -= 14; break;
      case "table": {
        const rows = b.rows || [];
        const cols = Math.max(1, ...rows.map((r) => r.length));
        const cw = (W - 2 * M) / cols;
        for (let ri = 0; ri < rows.length; ri++) {
          need(18);
          for (let ci = 0; ci < rows[ri].length; ci++) {
            const f = ri === 0 ? bold : font;
            let txt = rows[ri][ci];
            while (txt && f.widthOfTextAtSize(txt, 9.5) > cw - 8) txt = txt.slice(0, -1);
            page.drawText(txt, { x: M + ci * cw + 3, y, size: 9.5, font: f, color: ink });
          }
          page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.5, color: line });
          y -= 17;
        }
        y -= 6; break;
      }
      case "image": drawRich([{ text: `[image: ${("caption" in b && b.caption) || "figure"}]`, bold: false }], 9.5, { color: soft }); break;
      case "page": drawRich([{ text: `→ ${("title" in b && b.title) || "sub-page"}`, bold: false }], 10.5, { color: soft }); break;
    }
  }
  page.drawText(`Page ${pageNum()}`, { x: W / 2 - 18, y: 40, size: 9, font, color: soft });
  return pdf.save();
}

/* --------------------------------------------- preparing: bake pdf amendments */

/** Bake owner amendments (white-outs + text corrections) INTO the PDF bytes.
 *  Runs at send time so the signing base is immutable from SENT onward. This
 *  covers/overlays; it does not reflow the PDF's own text (that boundary is
 *  stated in the UI — reflow needs the source document / DRAFTING). */
export async function bakeAnnotations(
  doc: EsignDocument,
  annotations: import("./snapshot").EsignAnnotation[],
): Promise<EsignDocument> {
  if (!annotations.length || !doc.mime.includes("pdf")) return doc;
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(base64ToBytes(doc.dataBase64));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const a of annotations) {
    if (a.page >= pdf.getPageCount()) continue;
    const page = pdf.getPage(a.page);
    const { width: pw, height: ph } = page.getSize();
    const x = a.x * pw, wf = a.w * pw, hf = a.h * ph;
    const yBox = ph - a.y * ph - hf;
    page.drawRectangle({ x, y: yBox, width: wf, height: hf, color: rgb(1, 1, 1) });
    if (a.kind === "text" && a.text) {
      const size = Math.min(hf * 0.7, 11);
      let ty = yBox + hf - size * 1.15;
      for (const ln of a.text.split("\n")) {
        page.drawText(ln, { x: x + 2, y: ty, size, font, color: rgb(0.11, 0.15, 0.2) });
        ty -= size * 1.3;
      }
    }
  }
  const bytes = await pdf.save();
  return { ...doc, dataBase64: bytesToBase64(bytes) };
}
