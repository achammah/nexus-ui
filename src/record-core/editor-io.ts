/* editor-io — import/export for the NotionEditor block model. All client-side, CSP-safe
   (no external host), MIT/permissive libs. The heavy libraries (`docx` for .docx export,
   `mammoth` for .docx import) are DYNAMICALLY imported inside their functions so the base
   bundle carries none of their weight — only the markdown/HTML paths (pure, tiny) load
   eagerly. Markdown/HTML importers + the block model live in NotionEditor; this file adds
   the FILE-level exporters/importers + a standalone-styled HTML renderer. */
import type { Block } from "./NotionEditor";
import { blocksToMarkdown, markdownToBlocks, htmlToBlocks, highlightCode, esc } from "./NotionEditor";

/* light-theme option-color hexes (the exported artifact is standalone — it can't read the
   app's --nx-* vars — so colors are concrete here). */
const OPT_HEX: Record<string, string> = {
  gray: "6b7280", blue: "2563eb", green: "16a34a", yellow: "ca8a04", orange: "ea580c",
  red: "dc2626", purple: "9333ea", pink: "db2777", teal: "0d9488",
};
const ACCENT = "4f46e5";

/* inline token text → standalone HTML with concrete inline styles (bold/italic/underline/
   strike/code/link/highlight/color). Code + links are stashed first so their contents are
   never re-formatted (ASCII sentinels — grep/tool-safe). */
export function inlineToHtml(text: string): string {
  const stash: string[] = [];
  const keep = (h: string) => { stash.push(h); return `@@K${stash.length - 1}@@`; };
  let s = esc(text)
    .replace(/`([^`]+)`/g, (_m, c) => keep(`<code style="font-family:ui-monospace,Menlo,monospace;background:#f2f1ef;border:1px solid #e4e2dd;border-radius:3px;padding:0 4px;font-size:.9em">${c}</code>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => keep(`<a href="${u}" style="color:#${ACCENT}">${t}</a>`));
  s = s
    .replace(/\[\[page:([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, id, t) => `<a href="#page-${id}" style="color:#${ACCENT};font-weight:500">${t || "page"}</a>`)
    .replace(/\[\[c:([a-z]+)\|([^\]]*)\]\]/g, (_m, c, t) => `<span style="color:#${OPT_HEX[c] || "1c1b19"}">${t}</span>`)
    .replace(/\[\[h:([a-z]+)\|([^\]]*)\]\]/g, (_m, c, t) => `<mark style="background:#${OPT_HEX[c] || ACCENT}44">${t}</mark>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>")
    .replace(/==([^=]+)==/g, `<mark style="background:#${ACCENT}33">$1</mark>`);
  return s.replace(/@@K(\d+)@@/g, (_m, i) => stash[+i]);
}

const EXPORT_CSS = `
:root{color-scheme:light}
body{max-width:46rem;margin:3rem auto;padding:0 1.5rem;font:400 16px/1.7 -apple-system,"Segoe UI",Inter,system-ui,sans-serif;color:#1c1b19;background:#fff}
h1,h2,h3{line-height:1.25;font-weight:750;margin:1.6em 0 .4em;letter-spacing:-.02em}
h1{font-size:2rem} h2{font-size:1.5rem} h3{font-size:1.2rem}
.doc-title{font-size:2.4rem;font-weight:800;margin:0 0 1rem}
p{margin:.55em 0} a{color:#${ACCENT}} ul,ol{margin:.3em 0;padding-inline-start:1.4em}
blockquote{border-left:3px solid #${ACCENT};margin:.6em 0;padding:.1em 0 .1em 1em;color:#555;font-style:italic}
hr{border:0;border-top:1px solid #e4e2dd;margin:1.5em 0}
img{max-width:100%;border-radius:8px} figure{margin:1em 0} figcaption{font-size:.85em;color:#777;text-align:center;margin-top:.4em}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.95em} th,td{border:1px solid #e4e2dd;padding:7px 11px;text-align:left} th{background:#f2f1ef;font-weight:700}
pre{background:#f6f6f4;border:1px solid #e4e2dd;border-radius:8px;padding:14px 16px;overflow-x:auto;font:13px/1.6 ui-monospace,Menlo,monospace}
.callout{display:flex;gap:12px;padding:13px 16px;margin:.7em 0;background:#eef1fe;border:1px solid #c9d2fb;border-radius:9px}
.todo{display:flex;gap:9px;align-items:flex-start;margin:.3em 0}
details{margin:.4em 0} summary{cursor:pointer;font-weight:600}
.ne-t-c{color:#8a8680;font-style:italic}.ne-t-s{color:#0a7a34}.ne-t-n{color:#b45309}.ne-t-k{color:#7c3aed;font-weight:600}
@media print{body{margin:0;max-width:none;padding:1.2cm 1.6cm}a{color:#333}pre,blockquote,.callout{break-inside:avoid}}
`;

/* blocks → HTML. `full` wraps a complete self-contained document (styles inlined) for
   HTML export + the print-to-PDF route; otherwise just the body fragment. */
export function blocksToHtml(blocks: Block[], opts: { full?: boolean; title?: string } = {}): string {
  const part = (b: Block): string => {
    const ind = "indent" in b && b.indent ? ` style="margin-inline-start:${b.indent * 1.7}em"` : "";
    switch (b.type) {
      case "divider": return "<hr>";
      case "image": return `<figure><img src="${b.src}" alt="${esc(b.caption || "")}">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
      case "table": return `<table><tbody>${b.rows.map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th>${inlineToHtml(c)}</th>` : `<td>${inlineToHtml(c)}</td>`)).join("")}</tr>`).join("")}</tbody></table>`;
      case "code": return `<pre${ind}><code>${highlightCode(b.text, b.lang)}</code></pre>`;
      case "h1": return `<h1${ind}>${inlineToHtml(b.text)}</h1>`;
      case "h2": return `<h2${ind}>${inlineToHtml(b.text)}</h2>`;
      case "h3": return `<h3${ind}>${inlineToHtml(b.text)}</h3>`;
      case "quote": return `<blockquote${ind}>${inlineToHtml(b.text)}</blockquote>`;
      case "callout": return `<div class="callout"${ind}><span>${b.emoji || "💡"}</span><div>${inlineToHtml(b.text)}</div></div>`;
      case "ul": return `<ul${ind}><li>${inlineToHtml(b.text)}</li></ul>`;
      case "ol": return `<ol${ind}><li>${inlineToHtml(b.text)}</li></ol>`;
      case "todo": return `<div class="todo"${ind}><input type="checkbox" ${b.checked ? "checked" : ""} disabled><span${b.checked ? ' style="text-decoration:line-through;color:#a3a099"' : ""}>${inlineToHtml(b.text)}</span></div>`;
      case "toggle": return `<details${ind} open><summary>${inlineToHtml(b.text)}</summary></details>`;
      case "page": return `<p class="page-ref"${ind}><a href="#page-${b.pageId}" style="font-weight:500;text-decoration:none">${b.icon ? esc(b.icon) + " " : "📄 "}${esc(b.title || "Sub-page")}</a></p>`;
      default: return `<p${ind}>${inlineToHtml((b as { text: string }).text)}</p>`;
    }
  };
  // merge adjacent non-indented same-type lists so bullets/numbers read as one list
  const body = blocks.map(part).join("\n").replace(/<\/ul>\n<ul>/g, "").replace(/<\/ol>\n<ol>/g, "");
  if (!opts.full) return body;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title || "Document")}</title><style>${EXPORT_CSS}</style></head><body>${opts.title ? `<h1 class="doc-title">${esc(opts.title)}</h1>` : ""}${body}</body></html>`;
}

/* ---- download helpers ---- */
const slug = (s?: string) => (s || "document").trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export const downloadText = (name: string, text: string, mime = "text/plain") => downloadBlob(name, new Blob([text], { type: `${mime};charset=utf-8` }));

/* ---- exporters ---- */
export function exportMarkdown(blocks: Block[], title?: string) {
  downloadText(`${slug(title)}.md`, (title ? `# ${title}\n\n` : "") + blocksToMarkdown(blocks), "text/markdown");
}
export function exportHtml(blocks: Block[], title?: string) {
  downloadText(`${slug(title)}.html`, blocksToHtml(blocks, { full: true, title }), "text/html");
}
/* Print-to-PDF — the faithful, zero-bundle route: open the standalone HTML in a window and
   invoke the browser's print dialog (Save as PDF). Renders the document exactly as styled. */
export function exportPdf(blocks: Block[], title?: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(blocksToHtml(blocks, { full: true, title }) + `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250);};<\/script>`);
  w.document.close();
  return true;
}

type Docx = typeof import("docx");
interface Marks { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; code?: boolean; color?: string; highlight?: string; link?: string }
function runsFromInline(docx: Docx, text: string) {
  const { TextRun, ExternalHyperlink } = docx;
  const parsed = new DOMParser().parseFromString(`<body>${inlineToHtml(text)}</body>`, "text/html");
  const runs: InstanceType<typeof TextRun | typeof ExternalHyperlink>[] = [];
  const props = (m: Marks) => ({
    bold: m.bold, italics: m.italics, strike: m.strike,
    underline: m.underline ? {} : undefined,
    font: m.code ? "Consolas" : undefined,
    color: m.color, shading: m.highlight ? { fill: m.highlight } : undefined,
  });
  const walk = (node: Node, m: Marks) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n.textContent || ""; if (!t) return;
        const run = new TextRun({ text: t, ...props(m) });
        runs.push(m.link ? new ExternalHyperlink({ children: [run], link: m.link }) : run);
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const e = n as HTMLElement; const nm: Marks = { ...m }; const tag = e.tagName;
      const style = e.getAttribute("style") || "";
      if (tag === "STRONG" || tag === "B") nm.bold = true;
      else if (tag === "EM" || tag === "I") nm.italics = true;
      else if (tag === "U") nm.underline = true;
      else if (tag === "DEL" || tag === "S") nm.strike = true;
      else if (tag === "CODE") nm.code = true;
      else if (tag === "MARK") nm.highlight = style.match(/background:#(\w{6})/)?.[1] || "FFE58F";
      else if (tag === "A") nm.link = e.getAttribute("href") || "";
      else if (tag === "SPAN") { const c = style.match(/color:#(\w{6})/); if (c) nm.color = c[1]; }
      walk(e, nm);
    });
  };
  walk(parsed.body, {});
  return runs.length ? runs : [new TextRun({ text: "" })];
}

/* blocks → a .docx Blob (lazy `docx`). Real headings, lists (bullet + numbered), quote
   border, callout shading, code lines, tables, and inline bold/italic/underline/strike/
   link/color/highlight. Data-URI images are noted as a placeholder line (kept lean).
   Split from exportDocx so the blob is testable (round-trip) without triggering a download. */
export async function docxBlob(blocks: Block[], title?: string): Promise<Blob> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = docx;
  const children: InstanceType<typeof Paragraph | typeof Table>[] = [];
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  for (const b of blocks) {
    const level = Math.min(("indent" in b && b.indent) || 0, 4);
    if (b.type === "divider") { children.push(new Paragraph({ border: { bottom: { color: "CCCCCC", size: 6, style: BorderStyle.SINGLE, space: 1 } } })); continue; }
    if (b.type === "image") { children.push(new Paragraph({ children: [new TextRun({ text: `🖼 ${b.caption || "image"}`, italics: true, color: "888888" })] })); continue; }
    if (b.type === "table") {
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((r, ri) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0 })] })] })) })) }));
      continue;
    }
    if (b.type === "code") { for (const ln of (b.text || "").split("\n")) children.push(new Paragraph({ shading: { fill: "F2F1EF" }, children: [new TextRun({ text: ln || " ", font: "Consolas", size: 20 })] })); continue; }
    const runs = runsFromInline(docx, (b as { text: string }).text || "");
    if (b.type === "h1") children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs }));
    else if (b.type === "h2") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs }));
    else if (b.type === "h3") children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs }));
    else if (b.type === "quote") children.push(new Paragraph({ indent: { left: 360 }, border: { left: { color: ACCENT.toUpperCase(), size: 18, style: BorderStyle.SINGLE, space: 12 } }, children: runs }));
    else if (b.type === "callout") children.push(new Paragraph({ shading: { fill: "EEF1FE" }, children: [new TextRun({ text: `${b.emoji || "💡"}  ` }), ...runs] }));
    else if (b.type === "ul") children.push(new Paragraph({ bullet: { level }, children: runs }));
    else if (b.type === "ol") children.push(new Paragraph({ numbering: { reference: "nx-ol", level }, children: runs }));
    else if (b.type === "todo") children.push(new Paragraph({ children: [new TextRun({ text: b.checked ? "☑  " : "☐  " }), ...runs] }));
    else if (b.type === "toggle") children.push(new Paragraph({ children: [new TextRun({ text: "▸  ", color: "888888" }), ...runs] }));
    else children.push(new Paragraph({ indent: level ? { left: level * 360 } : undefined, children: runs }));
  }
  const doc = new Document({
    numbering: { config: [{ reference: "nx-ol", levels: [0, 1, 2, 3, 4].map((l) => ({ level: l, format: "decimal" as const, text: `%${l + 1}.`, alignment: AlignmentType.START })) }] },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}
export async function exportDocx(blocks: Block[], title?: string) {
  downloadBlob(`${slug(title)}.docx`, await docxBlob(blocks, title));
}

/* ---- importers ---- */
export interface ImportResult { blocks: Block[]; warnings: string[] }
/* File → Block[], by extension/mime: .docx via lazy mammoth (docx→HTML→blocks), .html via
   the HTML normalizer, everything else as markdown/plain. */
export async function importFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  const warnings: string[] = [];
  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const res = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    res.messages?.forEach((mm) => warnings.push(mm.message));
    return { blocks: htmlToBlocks(res.value), warnings };
  }
  if (name.endsWith(".html") || name.endsWith(".htm") || file.type.includes("html")) {
    return { blocks: htmlToBlocks(await file.text()), warnings };
  }
  return { blocks: markdownToBlocks(await file.text()), warnings };
}

export const IMPORT_ACCEPT = ".md,.markdown,.txt,.html,.htm,.docx";
