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
}

export interface PdfDocHandle {
  pageCount: number;
  getPage: (index: number) => Promise<PdfPageHandle>;
  destroy: () => void;
}

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

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
          const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: scale * dpr });
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          await page.render({ canvasContext: ctx, viewport }).promise;
        },
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
