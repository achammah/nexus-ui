import * as React from "react";
import { PageIcon } from "./PageIcon";
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown, ImagePlus, Table as TableIcon, Type, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus, X, CheckSquare, Check, ChevronRight, Code2, Lightbulb, Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code as CodeInline, Link2, Highlighter, Baseline, Copy, FileText, ChevronRight as PageArrow } from "lucide-react";

/* record-core — a Notion-grade block editor, the `richText` field type's editor.
   Blocks are contenteditable; "/" opens a command menu (text, headings, lists,
   quote, divider, image, table); images drag-drop anywhere; tables are editable
   grids. The parent owns the block array + persistence; this component is a
   CONTROLLED editor: it renders `blocks` and calls `onChange` on every edit.
   Caret safety: text nodes are set imperatively on mount and only re-synced when
   the value changes AND the node isn't focused, so typing never loses the caret.
   Entity-agnostic — no coupling to any object type or field key. The optional
   `changes`/`hoveredChange`/`onHoverChange` props render inline tracked-change
   widgets; the accept/reject engine + rail is a SEPARATE suggestions layer. */

/* callout tones map to the token canvas' semantic soft-fills (info rides the accent). */
export type CalloutTone = "info" | "ok" | "warn" | "danger";

/* The block model is FLAT and additive — every new type is optional over the original
   union, so any persisted Block[] stays valid. Nesting is an `indent` LEVEL (0..5) on a
   flat block, not a child tree: it keeps the array contract every consumer relies on
   (useSuggestions folds over it; DataTable flattens it) while still rendering nested
   lists + collapsible toggles. `todo`/`toggle`/`callout`/`code` all carry `.text`, so the
   suggestions engine's text-block guard (!divider/image/table) treats them correctly. */
export type Block =
  | { id: string; type: "p" | "h1" | "h2" | "h3" | "quote" | "ul" | "ol"; text: string; indent?: number }
  | { id: string; type: "todo"; text: string; checked?: boolean; indent?: number }
  | { id: string; type: "toggle"; text: string; collapsed?: boolean; indent?: number }
  | { id: string; type: "callout"; text: string; emoji?: string; tone?: CalloutTone; indent?: number }
  | { id: string; type: "code"; text: string; lang?: string; indent?: number }
  | { id: string; type: "page"; pageId: string; title?: string; icon?: string; indent?: number }
  | { id: string; type: "divider" }
  | { id: string; type: "image"; src: string; caption?: string }
  | { id: string; type: "table"; rows: string[][] };

export type BlockType = Block["type"];

/* which slash-menu block types this editor offers, whether the inline toolbar +
   markdown shortcuts + slash menu are on. All optional; omitted = everything on. The
   surface-level knobs (outline, import/export, page width) live on DocumentConfig. */
export interface EditorConfig {
  blocks?: BlockType[];
  toolbar?: boolean;
  markdownShortcuts?: boolean;
  slashMenu?: boolean;
}

/* the page-workspace seam — passed by PageWorkspace so the editor can render sub-page blocks
   + [[page:]] links, open/create pages, and autocomplete page links, while staying
   entity-agnostic (it only calls these callbacks; without them, page refs degrade to a
   static chip and "/page" hides). */
export interface PageContext {
  resolve: (pageId: string) => { title: string; icon?: string } | null;
  search: (query: string) => { id: string; title: string; icon?: string }[];
  onOpenPage: (pageId: string) => void;
  onCreateSubPage: (title: string) => string; // host creates the page, returns its id
}

let _seq = 0;
export const bid = () => `b${Date.now().toString(36)}${(_seq++).toString(36)}`;

/* text-bearing block that behaves like a paragraph for Enter/Backspace/merge/indent.
   `code` is text-bearing but NOT here — it owns Enter (inserts a newline, never splits). */
const TEXTLIKE = new Set(["p", "h1", "h2", "h3", "quote", "ul", "ol", "todo", "toggle", "callout"]);
/* blocks whose text lives in `.text` (everything except the three structural blocks) */
const TEXT_BEARING = new Set(["p", "h1", "h2", "h3", "quote", "ul", "ol", "todo", "toggle", "callout", "code"]);
/* blocks that accept an indent level (nested lists + nested toggles/todos + paragraphs) */
const INDENTABLE = new Set(["p", "h1", "h2", "h3", "quote", "ul", "ol", "todo", "toggle", "callout", "page"]);
const MAX_INDENT = 5;
const CALLOUT_EMOJIS = ["💡", "📌", "⚠️", "✅", "🔥", "📝", "❗", "ℹ️", "🎯", "🚀"];
const CODE_LANGS = ["plain", "ts", "js", "tsx", "json", "python", "bash", "sql", "html", "css", "go", "rust", "md"];
/* the token canvas' option-color names — the inline text-color + highlight palette */
const OPT_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink", "teal"];

/* markdown ⇆ blocks — seed a richText value from plain text, and flatten back to
   markdown (table-cell previews, exports, a plain-text mirror). */
export function textToBlocks(text: string): Block[] {
  const src = (text || "").replace(/\r/g, "");
  const out: Block[] = [];
  for (const chunk of src.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    if (lines.length === 1 && /^[/*]$/.test(lines[0].trim())) continue; // stray slash/marker artifact
    // a chunk of list items → one block per item
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) { for (const l of lines) out.push({ id: bid(), type: "ul", text: l.replace(/^\s*[-*]\s+/, "") }); continue; }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) { for (const l of lines) out.push({ id: bid(), type: "ol", text: l.replace(/^\s*\d+[.)]\s+/, "") }); continue; }
    const joined = lines.join(" ").trim();
    if (/^#\s+/.test(joined)) out.push({ id: bid(), type: "h1", text: joined.replace(/^#\s+/, "") });
    else if (/^##\s+/.test(joined)) out.push({ id: bid(), type: "h2", text: joined.replace(/^##\s+/, "") });
    else if (/^###\s+/.test(joined)) out.push({ id: bid(), type: "h3", text: joined.replace(/^###\s+/, "") });
    else if (/^>\s+/.test(joined)) out.push({ id: bid(), type: "quote", text: joined.replace(/^>\s+/, "") });
    else if (/^(-{3,}|\*{3,})$/.test(joined)) out.push({ id: bid(), type: "divider" });
    else out.push({ id: bid(), type: "p", text: joined });
  }
  if (!out.length) out.push({ id: bid(), type: "p", text: "" });
  return out;
}

/* degrade the non-standard inline marks (underline, colored highlight, text color) to
   their inner text for markdown export; `== highlight ==` is kept (widely supported). */
function mdInlineDegrade(t: string): string {
  return t
    .replace(/\[\[page:([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, id, title) => `[${title || "page"}](#page-${id})`)
    .replace(/\[\[h:[a-z]+\|([^\]]*)\]\]/g, "==$1==")
    .replace(/\[\[c:[a-z]+\|([^\]]*)\]\]/g, "$1")
    .replace(/\+\+([^+]+)\+\+/g, "$1");
}

export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const ind = "indent" in b && b.indent ? "  ".repeat(Math.min(b.indent, MAX_INDENT)) : "";
    if (b.type === "divider") { parts.push("---"); continue; }
    if (b.type === "image") { parts.push(`![${b.caption || ""}](${b.src.slice(0, 60)}${b.src.length > 60 ? "…" : ""})`); continue; }
    if (b.type === "table") { parts.push(b.rows.map((r) => `| ${r.join(" | ")} |`).join("\n").replace(/^(.*)\n/, (m, h) => `${h}\n| ${b.rows[0].map(() => "---").join(" | ")} |\n`)); continue; }
    if (b.type === "code") { parts.push("```" + (b.lang && b.lang !== "plain" ? b.lang : "") + "\n" + b.text + "\n```"); continue; }
    if (b.type === "page") { parts.push(`${ind}- ${b.icon ? b.icon + " " : "📄 "}[${b.title || "Sub-page"}](#page-${b.pageId})`); continue; }
    const text = mdInlineDegrade(b.text);
    if (b.type === "h1") parts.push(`# ${text}`);
    else if (b.type === "h2") parts.push(`## ${text}`);
    else if (b.type === "h3") parts.push(`### ${text}`);
    else if (b.type === "quote") parts.push(`> ${text}`);
    else if (b.type === "callout") parts.push(`> ${b.emoji || "💡"} ${text}`);
    else if (b.type === "ul") parts.push(`${ind}- ${text}`);
    else if (b.type === "ol") parts.push(`${ind}1. ${text}`);
    else if (b.type === "todo") parts.push(`${ind}- [${b.checked ? "x" : " "}] ${text}`);
    else if (b.type === "toggle") parts.push(`${ind}- ${text}`);
    else parts.push(ind + text);
  }
  return parts.join("\n\n");
}

/* a live markdown shortcut: the WHOLE (paragraph) text is exactly a block marker + space,
   typed at the start of an empty line. Returns the block patch to apply, or null. Kept
   strict (exact match) so a dash/`>` mid-prose never mutates a block. */
function mdShortcut(t: string): Partial<Block> | null {
  if (t === "# ") return { type: "h1", text: "" };
  if (t === "## ") return { type: "h2", text: "" };
  if (t === "### ") return { type: "h3", text: "" };
  if (t === "- " || t === "* " || t === "• ") return { type: "ul", text: "" };
  if (/^1[.)] $/.test(t)) return { type: "ol", text: "" };
  if (t === "[] " || t === "[ ] ") return { type: "todo", text: "", checked: false } as Partial<Block>;
  if (t === "[x] " || t === "[X] ") return { type: "todo", text: "", checked: true } as Partial<Block>;
  if (t === "> " || t === ">> ") return { type: "quote", text: "" };
  if (t === "| ") return { type: "callout", text: "", emoji: "💡" } as Partial<Block>;
  if (t === "``` ") return { type: "code", text: "", lang: "plain" } as Partial<Block>;
  const codeM = t.match(/^```(\w+) $/); if (codeM) return { type: "code", text: "", lang: codeM[1] } as Partial<Block>;
  if (t === "---" || t === "***") return { type: "divider" } as Partial<Block>;
  return null;
}

/* normalize external markdown's underscore emphasis to our asterisk vocabulary (our
   stored inline form is **b** *i* ~~s~~ `c` [l](u) ==h==, plus ++u++ / [[c|h:..]] tokens). */
const mdInlineNorm = (s: string) => s.replace(/__([^_]+)__/g, "**$1**").replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1*$2*");

/* markdownToBlocks — a fuller importer than textToBlocks: fenced code (+lang), GFM tables,
   task lists, nested lists (2-space indent → level), callouts (blockquote w/ a lead emoji),
   headings, images, dividers. The authoritative Markdown → Block[] path (paste + import). */
export function markdownToBlocks(md: string): Block[] {
  const lines = (md || "").replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  const lvl = (s: string) => Math.min(MAX_INDENT, Math.floor((s.match(/^ */)?.[0].length || 0) / 2));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || "plain"; const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; out.push({ id: bid(), type: "code", text: buf.join("\n"), lang }); continue;
    }
    if (line.trim() === "") { i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const parseRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const rows: string[][] = [parseRow(line)]; i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(parseRow(lines[i])); i++; }
      const w = Math.max(...rows.map((r) => r.length)); rows.forEach((r) => { while (r.length < w) r.push(""); });
      out.push({ id: bid(), type: "table", rows }); continue;
    }
    const indent = lvl(line); const t = line.trim(); let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) out.push({ id: bid(), type: (["h1", "h2", "h3"][m[1].length - 1]) as "h1", text: mdInlineNorm(m[2]) });
    else if (/^#{4,6}\s+/.test(t)) out.push({ id: bid(), type: "h3", text: mdInlineNorm(t.replace(/^#+\s+/, "")) });
    else if ((m = t.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/))) out.push({ id: bid(), type: "todo", text: mdInlineNorm(m[2]), checked: m[1].toLowerCase() === "x", indent });
    else if ((m = t.match(/^[-*+]\s+(.*)$/))) out.push({ id: bid(), type: "ul", text: mdInlineNorm(m[1]), indent });
    else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) out.push({ id: bid(), type: "ol", text: mdInlineNorm(m[1]), indent });
    else if ((m = t.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) out.push({ id: bid(), type: "image", src: m[2], caption: m[1] || undefined });
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) out.push({ id: bid(), type: "divider" });
    else if ((m = t.match(/^>\s?(.*)$/))) {
      const em = m[1].match(/^(\p{Extended_Pictographic}(?:️)?)\s+(.*)$/u);
      if (em) out.push({ id: bid(), type: "callout", text: mdInlineNorm(em[2]), emoji: em[1] });
      else out.push({ id: bid(), type: "quote", text: mdInlineNorm(m[1]) });
    } else out.push({ id: bid(), type: "p", text: mdInlineNorm(t), indent });
    i++;
  }
  return out.length ? out : [{ id: bid(), type: "p", text: "" }];
}

/* inline HTML → our token text — the Word/Google-Docs/web paste normalizer. Keeps
   bold/italic/underline/strike/code/link/highlight, drops every foreign style/class. */
function htmlInlineToText(el: Node): string {
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent || "").replace(/\s+/g, " ");
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const e = n as HTMLElement; const tag = e.tagName;
    if (tag === "BR") return "\n";
    if (tag === "STYLE" || tag === "SCRIPT") return "";
    const inner = Array.from(e.childNodes).map(walk).join("");
    if (!inner) return "";
    const st = e.style || ({} as CSSStyleDeclaration);
    const td = st.textDecoration || st.textDecorationLine || "";
    if (tag === "STRONG" || tag === "B" || /^(bold|[6-9]00)$/.test(st.fontWeight || "")) return `**${inner}**`;
    if (tag === "EM" || tag === "I" || st.fontStyle === "italic") return `*${inner}*`;
    if (tag === "U" || /underline/.test(td)) return `++${inner}++`;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(td)) return `~~${inner}~~`;
    if (tag === "CODE" || tag === "TT" || tag === "KBD") return "`" + inner + "`";
    if (tag === "A") { const href = e.getAttribute("href") || ""; return href ? `[${inner}](${href})` : inner; }
    const bg = st.backgroundColor || "";
    if (tag === "MARK" || (bg && bg !== "transparent" && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(bg))) return `==${inner}==`;
    return inner;
  };
  return Array.from((el as HTMLElement).childNodes).map(walk).join("").replace(/ /g, " ").replace(/[ \t]+/g, " ");
}
const tableToRows = (t: HTMLElement): string[][] => {
  const rows: string[][] = [];
  t.querySelectorAll("tr").forEach((tr) => { const cells: string[] = []; tr.querySelectorAll("th,td").forEach((td) => cells.push(htmlInlineToText(td).trim())); if (cells.length) rows.push(cells); });
  const w = rows.length ? Math.max(...rows.map((r) => r.length)) : 0;
  rows.forEach((r) => { while (r.length < w) r.push(""); });
  return rows;
};

/* htmlToBlocks — clipboard/DOCX HTML → clean Block[]. Recurses wrappers, maps block
   elements to block types, folds nested lists to indent levels, strips foreign chrome. */
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: Block[] = [];
  const walkList = (listEl: HTMLElement, ordered: boolean, indent = 0) => {
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== "LI") return;
      const cb = li.querySelector(":scope > input[type=checkbox], :scope > * > input[type=checkbox]") as HTMLInputElement | null;
      const nested = li.querySelector(":scope > ul, :scope > ol") as HTMLElement | null;
      const clone = li.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("ul,ol,input").forEach((n) => n.remove());
      const text = htmlInlineToText(clone).trim();
      const cls = (li.getAttribute("class") || "") + (li.parentElement?.getAttribute("class") || "");
      const isTask = !!cb || /task|checkbox|checklist/i.test(cls);
      if (isTask) out.push({ id: bid(), type: "todo", text, checked: !!cb?.checked || /checked/i.test(cls), indent });
      else out.push({ id: bid(), type: ordered ? "ol" : "ul", text, indent });
      if (nested) walkList(nested, nested.tagName === "OL", Math.min(MAX_INDENT, indent + 1));
    });
  };
  // restore an exported block's indent level from its margin style (round-trips nesting)
  const styleIndent = (e: HTMLElement) => { const m = (e.getAttribute("style") || "").match(/margin-(?:inline-start|left):\s*([\d.]+)em/); return m ? Math.min(MAX_INDENT, Math.round(parseFloat(m[1]) / 1.7)) : 0; };
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const walk = (el: HTMLElement) => {
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) { const tx = (node.textContent || "").trim(); if (tx) out.push({ id: bid(), type: "p", text: tx }); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const e = node as HTMLElement; const tag = e.tagName; const cls = e.getAttribute("class") || ""; const ind = styleIndent(e);
      if (/^H[1-3]$/.test(tag)) out.push({ id: bid(), type: (["h1", "h2", "h3"][+tag[1] - 1]) as "h1", text: htmlInlineToText(e).trim() });
      else if (/^H[4-6]$/.test(tag)) out.push({ id: bid(), type: "h3", text: htmlInlineToText(e).trim() });
      else if (tag === "P") { const tx = htmlInlineToText(e).trim(); if (tx) out.push({ id: bid(), type: "p", text: tx, indent: ind } as Block); }
      else if (tag === "UL" || tag === "OL") walkList(e, tag === "OL", ind);
      else if (tag === "BLOCKQUOTE") out.push({ id: bid(), type: "quote", text: htmlInlineToText(e).trim(), indent: ind } as Block);
      else if (tag === "PRE") out.push({ id: bid(), type: "code", text: (e.textContent || "").replace(/\n$/, ""), lang: "plain" });
      else if (tag === "HR") out.push({ id: bid(), type: "divider" });
      else if (tag === "DETAILS") { const sm = e.querySelector(":scope > summary"); out.push({ id: bid(), type: "toggle", text: sm ? htmlInlineToText(sm).trim() : "", collapsed: !e.hasAttribute("open"), indent: ind } as Block); }
      else if (tag === "IMG") { const src = e.getAttribute("src") || ""; if (src) out.push({ id: bid(), type: "image", src, caption: e.getAttribute("alt") || undefined }); }
      else if (tag === "TABLE") { const rows = tableToRows(e); if (rows.length) out.push({ id: bid(), type: "table", rows }); }
      // a callout div (our export, or Notion/web) → callout block, lifting a leading emoji
      else if ((tag === "DIV" || tag === "ASIDE") && /\bcallout\b/i.test(cls)) {
        const span = e.querySelector(":scope > span"); const emoji = span && EMOJI_RE.test(span.textContent || "") ? (span.textContent || "").trim() : undefined;
        const body = e.cloneNode(true) as HTMLElement; if (emoji) body.querySelector(":scope > span")?.remove();
        out.push({ id: bid(), type: "callout", text: htmlInlineToText(body).trim(), emoji, indent: ind } as Block);
      }
      // a to-do div (our export, or a checkbox list item lifted to top level)
      else if (tag === "DIV" && (/\b(todo|task)\b/i.test(cls) || e.querySelector(":scope > input[type=checkbox]"))) {
        const cb = e.querySelector(":scope > input[type=checkbox]") as HTMLInputElement | null;
        const body = e.cloneNode(true) as HTMLElement; body.querySelectorAll("input").forEach((n) => n.remove());
        out.push({ id: bid(), type: "todo", text: htmlInlineToText(body).trim(), checked: !!cb?.checked, indent: ind } as Block);
      }
      // any OTHER element (div/section, or an inline wrapper like Google-Docs' outer <b>)
      // that CONTAINS block-level children is transparent → recurse; else it's a paragraph
      else if (e.querySelector("h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,table,hr,img,details,div")) walk(e);
      else { const tx = htmlInlineToText(e).trim(); if (tx) out.push({ id: bid(), type: "p", text: tx, indent: ind } as Block); }
    });
  };
  walk(doc.body);
  return out.length ? out : [{ id: bid(), type: "p", text: "" }];
}

interface Cmd { key: Block["type"]; label: string; hint: string; icon: React.ReactNode; kw: string; }
const COMMANDS: Cmd[] = [
  { key: "p", label: "Text", hint: "Plain paragraph", icon: <Type size={15} />, kw: "text paragraph body p" },
  { key: "h1", label: "Heading 1", hint: "Big section title", icon: <Heading1 size={15} />, kw: "h1 heading title big" },
  { key: "h2", label: "Heading 2", hint: "Medium heading", icon: <Heading2 size={15} />, kw: "h2 heading subtitle" },
  { key: "h3", label: "Heading 3", hint: "Small heading", icon: <Heading3 size={15} />, kw: "h3 heading" },
  { key: "ul", label: "Bulleted list", hint: "• item", icon: <List size={15} />, kw: "bullet list unordered ul" },
  { key: "ol", label: "Numbered list", hint: "1. item", icon: <ListOrdered size={15} />, kw: "number ordered list ol" },
  { key: "page", label: "Sub-page", hint: "New page inside this one", icon: <FileText size={15} />, kw: "page subpage child document link new" },
  { key: "todo", label: "To-do list", hint: "☐ checkable item", icon: <CheckSquare size={15} />, kw: "todo task checkbox check checklist" },
  { key: "toggle", label: "Toggle list", hint: "▸ collapsible section", icon: <ChevronRight size={15} />, kw: "toggle collapse expand fold details" },
  { key: "quote", label: "Quote", hint: "Blockquote", icon: <Quote size={15} />, kw: "quote blockquote citation" },
  { key: "callout", label: "Callout", hint: "Highlighted note", icon: <Lightbulb size={15} />, kw: "callout note tip info aside admonition" },
  { key: "code", label: "Code", hint: "Code block + language", icon: <Code2 size={15} />, kw: "code snippet pre monospace syntax" },
  { key: "divider", label: "Divider", hint: "Horizontal rule", icon: <Minus size={15} />, kw: "divider hr line separator" },
  { key: "image", label: "Image", hint: "Upload or drop", icon: <ImagePlus size={15} />, kw: "image picture photo img" },
  { key: "table", label: "Table", hint: "Editable grid", icon: <TableIcon size={15} />, kw: "table grid rows columns" },
];

async function fileToDataUri(f: File): Promise<string | null> {
  if (!f.type.startsWith("image/")) return null;
  const uri = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
  return uri.length < 4_000_000 ? uri : null;
}

/* an inline edit suggestion, rendered as a tracked change (Google-Docs style).
   The suggestions LAYER (a separate lane) produces + resolves these; this editor
   only RENDERS the ones it's handed. */
export interface InlineChange { id: string; original: string; replacement: string; status: "pending" | "accepted" | "rejected"; kind?: string; author?: string; authorColor?: string; createdAt?: number; blockId?: string; offset?: number }

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* the cid carried by the LIVE tracked-change widget while a block is being edited in suggesting
   mode. It is deliberately not a real change id: serializeBlock falls back to the <del> text for
   an unknown cid, which is exactly the committed original — so any stray serialization of a
   half-typed suggestion still yields the untouched text. */
const LIVE_CID = "__live__";

/* A dependency-free lightweight code highlighter — enough to READ as highlighted across
   common languages, zero bundle weight. Comments + strings are STASHED behind ASCII
   sentinels FIRST so the keyword/number passes never scan the markup they insert (the
   token spans carry a `class=` attribute — itself a keyword — which would otherwise
   collide); keyword runs before number, and neither re-matches the other's output. */
const CODE_KEYWORDS = /\b(const|let|var|function|return|if|else|elif|for|while|do|switch|case|break|continue|import|export|from|as|default|class|extends|new|this|super|typeof|instanceof|in|of|await|async|yield|try|catch|finally|throw|def|lambda|pass|with|print|public|private|protected|static|final|void|int|float|double|bool|boolean|string|char|struct|enum|interface|type|func|package|fn|impl|pub|use|mut|match|select|where|group|order|insert|update|delete|null|nil|None|True|False|true|false|undefined)\b/g;
export function highlightCode(code: string, lang?: string): string {
  const e = esc(code);
  if (!lang || lang === "plain") return e || "&nbsp;";
  const stash: string[] = [];
  const keep = (html: string) => { stash.push(html); return `@@K${stash.length - 1}@@`; };
  let s = e
    .replace(/(\/\*[\s\S]*?\*\/|(?:\/\/|#|--)[^\n]*)/g, (m) => keep(`<span class="ne-t-c">${m}</span>`))
    .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`|"[^"\n]*"|'[^'\n]*')/g, (m) => keep(`<span class="ne-t-s">${m}</span>`));
  s = s
    .replace(CODE_KEYWORDS, '<span class="ne-t-k">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="ne-t-n">$1</span>');
  return s.replace(/@@K(\d+)@@/g, (_m, i) => stash[+i]);
}

/* build a block's inner HTML with tracked-change widgets: each change is an ATOMIC
   contenteditable=false span (del + ins) embedded in otherwise-editable text, so the
   author can keep typing around it while the suggestion stays visible (Google-Docs style). */
/* inline markdown → HTML, applied to ALREADY-ESCAPED text so generated copy renders
   formatted (bold, links, inline code) instead of showing raw **…** / [..](..). The
   round-trip back to markdown lives in serializeBlock, so edits + saves stay markdown. */
function inlineMd(escaped: string): string {
  // protect inline code + links FIRST — their contents must not be re-formatted — by
  // stashing them behind sentinels, running the rest, then restoring (NUL never occurs
  // in editable text, so it is a safe placeholder).
  const stash: string[] = [];
  const keep = (html: string) => { stash.push(html); return `\u0000${stash.length - 1}\u0000`; };
  let s = escaped
    .replace(/`([^`]+)`/g, (_m, c) => keep(`<code data-md="c">${c}</code>`))
    .replace(/\[\[page:([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, id, title) => keep(`<span class="ne-pagelink" data-page="${id}" contenteditable="false">${title || "Untitled"}</span>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => keep(`<a href="${u}" class="ne-a" data-md="link" target="_blank" rel="noopener">${t}</a>`));
  s = s
    .replace(/\[\[c:([a-z]+)\|([^\]]*)\]\]/g, '<span class="ne-color" data-c="$1">$2</span>')
    .replace(/\[\[h:([a-z]+)\|([^\]]*)\]\]/g, '<span class="ne-hl" data-h="$1">$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong data-md="b">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em data-md="i">$2</em>')
    .replace(/~~([^~]+)~~/g, '<del data-md="s">$1</del>')
    .replace(/\+\+([^+]+)\+\+/g, '<u data-md="u">$1</u>')
    .replace(/==([^=]+)==/g, '<mark data-md="h" class="ne-hl">$1</mark>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => stash[+i]);
}

function buildBlockHtml(text: string, chs: InlineChange[]): string {
  if (!chs.length) return inlineMd(esc(text));
  // a change with real original text anchors at that substring; an empty-original insertion
  // (live-capture path) anchors at its captured offset (clamped into the current text).
  const found = chs.map((c) => ({ c, i: c.original !== "" ? text.indexOf(c.original) : Math.min(c.offset ?? text.length, text.length) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  let pos = 0, html = "";
  for (const { c, i } of found) {
    if (i < pos) continue; // overlapping match — skip
    html += inlineMd(esc(text.slice(pos, i)));
    const who = c.author ? esc(c.author) : "";
    const authorAttr = who ? ` data-author="${who}" title="${who}${c.original && c.replacement ? " · edit" : c.replacement ? " · insertion" : " · deletion"}"` : "";
    // render inline tokens (color/highlight/link/page-link/marks) INSIDE the widget too, so a
    // suggested edit that carries formatting never leaks a raw [[…]] token in the del/ins.
    html += `<span class="ne-chg" data-cid="${c.id}"${authorAttr} contenteditable="false"><del>${inlineMd(esc(c.original))}</del><ins>${inlineMd(esc(c.replacement))}</ins></span>`;
    pos = i + c.original.length;
  }
  html += inlineMd(esc(text.slice(pos)));
  return html;
}

/* read the plain text back out of a (possibly decorated) editable block: change
   widgets contribute their ORIGINAL text, so the model stays anchored until resolved. */
function serializeBlock(el: HTMLElement, chs: InlineChange[]): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const e = node as HTMLElement;
    const cid = e.getAttribute("data-cid");
    // a tracked-change widget contributes its ORIGINAL text (stays anchored until resolved)
    if (cid) { const ch = chs.find((c) => c.id === cid); return ch ? ch.original : (e.querySelector("del")?.textContent || e.textContent || ""); }
    const tag = e.tagName;
    if (tag === "BR") return "\n";
    const inner = Array.from(e.childNodes).map(walk).join("");
    const st = e.style || ({} as CSSStyleDeclaration);
    const dp = e.getAttribute("data-page");
    if (dp) return `[[page:${dp}|${inner}]]`;
    const dc = e.getAttribute("data-c"); const dh = e.getAttribute("data-h");
    // color / highlight — both our own data-attr spans AND pasted style spans
    if (dc) return `[[c:${dc}|${inner}]]`;
    if (dh) return `[[h:${dh}|${inner}]]`;
    // inline-mark widgets round-trip back to their markdown/token source. execCommand
    // and pasted content land as tags OR as style spans — cover both.
    if (tag === "STRONG" || tag === "B" || /^(bold|[6-9]00)$/.test(st.fontWeight || "")) return `**${inner}**`;
    if (tag === "EM" || tag === "I" || st.fontStyle === "italic") return `*${inner}*`;
    if (tag === "U" || /underline/.test(st.textDecoration || st.textDecorationLine || "")) return `++${inner}++`;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(st.textDecoration || st.textDecorationLine || "")) return `~~${inner}~~`;
    if (tag === "CODE") return "`" + inner + "`";
    if (tag === "A") { const href = e.getAttribute("href") || ""; return `[${inner}](${href})`; }
    if (tag === "MARK") return `==${inner}==`;
    // block-ish wrappers a browser sometimes injects on Enter/paste → newline-separate
    if (tag === "DIV" || tag === "P") return inner ? "\n" + inner : "";
    return inner;
  };
  // strip a single leading synthetic newline (a wrapping DIV shouldn't prefix the block)
  return Array.from(el.childNodes).map(walk).join("").replace(/^\n/, "").replace(/ /g, " ");
}

export function NotionEditor({ blocks, onChange, readOnly, changes, hoveredChange, onHoverChange, config, pageContext, suggesting, suggestAuthor, onSuggestChange }: {
  blocks: Block[]; onChange: (b: Block[]) => void; readOnly?: boolean;
  changes?: InlineChange[]; hoveredChange?: string | null; onHoverChange?: (id: string | null) => void;
  config?: EditorConfig;
  pageContext?: PageContext;
  /* Suggesting mode — when true, inline text edits are captured as tracked changes rendered
     LIVE (mid-keystroke) via a beforeinput controller, instead of committing. The del/ins
     appears instantly as the user types; `onSuggestChange` reports the change per block. */
  suggesting?: boolean;
  suggestAuthor?: { name: string; color?: string };
  onSuggestChange?: (blockId: string, change: { original: string; replacement: string; offset: number } | null) => void;
}) {
  const cfg = config || {};
  const slashOn = cfg.slashMenu !== false && !readOnly;
  const mdOn = cfg.markdownShortcuts !== false && !readOnly;
  const toolbarOn = cfg.toolbar !== false && !readOnly;
  const cmds = React.useMemo(() => COMMANDS.filter((c) => (cfg.blocks ? cfg.blocks.includes(c.key) : true) && (c.key !== "page" || !!pageContext)), [cfg.blocks, pageContext]);

  const [drag, setDrag] = React.useState<{ id: string; overId: string | null; pos: "before" | "after" } | null>(null);
  const [grabId, setGrabId] = React.useState<string | null>(null);
  // the touch block-actions menu (there is no hover on touch to reveal the handle rail)
  const [blockMenu, setBlockMenu] = React.useState<string | null>(null);
  const pendingChanges = React.useMemo(() => (changes || []).filter((c) => c.status === "pending"), [changes]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef(drag); dragRef.current = drag; // latest drag for window pointer listeners (touch)
  // inline formatting toolbar — appears over a non-empty text selection (config-gated)
  const [toolbar, setToolbar] = React.useState<{ x: number; y: number; blockId: string } | null>(null);
  const [palette, setPalette] = React.useState<"none" | "hl" | "color">("none");

  // content is set imperatively (contenteditable), so sync the card→inline highlight via the DOM
  React.useEffect(() => {
    const root = rootRef.current; if (!root) return;
    root.querySelectorAll(".ne-chg.is-hot").forEach((e) => e.classList.remove("is-hot"));
    if (hoveredChange) root.querySelector(`.ne-chg[data-cid="${hoveredChange}"]`)?.classList.add("is-hot");
  }, [hoveredChange, blocks, changes]);
  const [menu, setMenu] = React.useState<{ blockId: string; query: string; sel: number; x: number; y: number; above: boolean } | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  // "[[" / "@" page-link autocomplete (only with a pageContext)
  const [pageMenu, setPageMenu] = React.useState<{ blockId: string; query: string; sel: number; x: number; y: number; above: boolean; stripLen: number } | null>(null);
  const pageMenuRef = React.useRef<HTMLDivElement | null>(null);
  // dismiss the slash menu on an outside click or a scroll (it would otherwise detach)
  const menuOpen = !!menu;
  React.useEffect(() => {
    if (!menuOpen) return;
    const down = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    // close on PAGE scroll, but ignore the menu's own internal scroll (scrollIntoView)
    const scroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    document.addEventListener("mousedown", down);
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("scroll", scroll, true); };
  }, [menuOpen]);
  // dismiss the page-link menu on an outside click / scroll
  const pageMenuOpen = !!pageMenu;
  React.useEffect(() => {
    if (!pageMenuOpen) return;
    const down = (e: MouseEvent) => { if (!pageMenuRef.current?.contains(e.target as Node)) setPageMenu(null); };
    const scroll = (e: Event) => { if (!pageMenuRef.current?.contains(e.target as Node)) setPageMenu(null); };
    document.addEventListener("mousedown", down);
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("scroll", scroll, true); };
  }, [pageMenuOpen]);
  const [dragOver, setDragOver] = React.useState(false);
  const elRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const imgTargetRef = React.useRef<string | null>(null); // block id whose "/image" opened the picker

  const filtered = menu ? cmds.filter((c) => { const q = menu.query.trim().toLowerCase(); return !q || c.kw.includes(q) || c.label.toLowerCase().includes(q); }) : [];
  const pageResults = React.useMemo(() => (pageMenu && pageContext ? pageContext.search(pageMenu.query).slice(0, 6) : []), [pageMenu, pageContext, blocks]);

  const update = (next: Block[]) => onChange(next);
  const patchBlock = (blockId: string, patch: Partial<Block>) =>
    update(blocks.map((b) => (b.id === blockId ? { ...b, ...patch } as Block : b)));

  // re-read a block's DOM back into its model (after an inline-mark edit that mutated the
  // contenteditable directly rather than through React)
  const reserialize = (blockId: string) => {
    const el = elRefs.current[blockId];
    if (el) patchBlock(blockId, { text: serializeBlock(el, pendingChanges) } as Partial<Block>);
  };
  // wrap the current selection in a fresh element (surroundContents, with an
  // extract+insert fallback for selections that cross element boundaries)
  const surroundSelection = (make: () => HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const wrap = make();
    try { range.surroundContents(wrap); }
    catch { wrap.appendChild(range.extractContents()); range.insertNode(wrap); }
    sel.removeAllRanges();
    const nr = document.createRange(); nr.selectNodeContents(wrap); sel.addRange(nr);
    return true;
  };
  type Mark = "bold" | "italic" | "underline" | "strike" | "code" | "link" | "highlight" | "color";
  const applyMark = (kind: Mark, blockId: string, arg?: string) => {
    const el = elRefs.current[blockId]; if (!el) return;
    el.focus();
    try { document.execCommand("styleWithCSS", false, "false"); } catch { /* older browsers */ }
    if (kind === "bold") document.execCommand("bold");
    else if (kind === "italic") document.execCommand("italic");
    else if (kind === "underline") document.execCommand("underline");
    else if (kind === "strike") document.execCommand("strikeThrough");
    else if (kind === "code") surroundSelection(() => { const c = document.createElement("code"); c.setAttribute("data-md", "c"); return c; });
    else if (kind === "highlight") surroundSelection(() => {
      if (arg) { const s = document.createElement("span"); s.className = "ne-hl"; s.setAttribute("data-h", arg); return s; }
      const m = document.createElement("mark"); m.className = "ne-hl"; m.setAttribute("data-md", "h"); return m;
    });
    else if (kind === "color") surroundSelection(() => { const s = document.createElement("span"); s.className = "ne-color"; s.setAttribute("data-c", arg || "blue"); return s; });
    else if (kind === "link") { const url = window.prompt("Link URL"); if (url) surroundSelection(() => { const a = document.createElement("a"); a.href = url; a.className = "ne-a"; a.setAttribute("data-md", "link"); a.target = "_blank"; a.rel = "noopener"; return a; }); }
    setPalette("none");
    reserialize(blockId);
  };

  // track the text selection → position the inline toolbar above it (config-gated; never
  // over a code block, and only inside THIS editor's root)
  React.useEffect(() => {
    if (!toolbarOn) { setToolbar(null); return; }
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setToolbar(null); setPalette("none"); return; }
      const node = sel.getRangeAt(0).commonAncestorContainer;
      const host = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
      const blockEl = host?.closest(".ne-block") as HTMLElement | null;
      if (!blockEl || !rootRef.current?.contains(blockEl)) { setToolbar(null); return; }
      const id = Object.keys(elRefs.current).find((k) => elRefs.current[k] === blockEl);
      if (!id || blocks.find((b) => b.id === id)?.type === "code") { setToolbar(null); return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setToolbar({ x: r.left + r.width / 2, y: r.top, blockId: id });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [toolbarOn, blocks]);

  const focusBlock = (blockId: string, toEnd = true) => {
    requestAnimationFrame(() => {
      const el = elRefs.current[blockId];
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(!toEnd ? true : false);
      sel.removeAllRanges(); sel.addRange(range);
    });
  };

  const caretAtStart = (el: HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length === 0;
  };
  const caretText = (el: HTMLElement): { before: string; after: string } => {
    const sel = window.getSelection();
    const full = el.textContent || "";
    if (!sel || sel.rangeCount === 0) return { before: full, after: "" };
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString();
    return { before, after: full.slice(before.length) };
  };
  // place the caret at a character offset within a (possibly multi-text-node) element
  const placeCaret = (el: HTMLElement, offset: number) => {
    const sel = window.getSelection(); if (!sel) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = offset, node = walker.nextNode() as Text | null, target: Text | null = null, pos = 0;
    while (node) { const len = (node.textContent || "").length; if (remaining <= len) { target = node; pos = remaining; break; } remaining -= len; node = walker.nextNode() as Text | null; }
    const range = document.createRange();
    if (target) range.setStart(target, pos); else { range.selectNodeContents(el); range.collapse(false); }
    range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
  };

  /* ── LIVE TRACKED CHANGES (suggesting mode) ────────────────────────────────────────────
     Word/Google-Docs suggest-mode renders the strikethrough + coloured insertion INSTANTLY as
     you type — not on blur, not debounced. A contenteditable can't do that by itself: letting
     the browser edit the DOM would drop the removed text (nothing left to strike) and rewriting
     innerHTML afterwards destroys the caret. So this OWNS the edit: every text input is
     intercepted at `beforeinput`, applied to an explicit model, re-rendered, and the caret is
     restored synchronously in the same event — zero deferral, zero debounce.

     The model for the block being edited, where prefix + deleted + suffix === the COMMITTED
     text (never mutated) and prefix + inserted + suffix === the suggested text:
       prefix | <del>deleted</del><ins>inserted</ins> | suffix        caret = index in `inserted`
     React never fights this: the block is focused, so the render guard leaves its DOM alone. */
  const sEdit = React.useRef<{ blockId: string; prefix: string; deleted: string; inserted: string; suffix: string; caret: number } | null>(null);

  const trackedHtml = (st: { prefix: string; deleted: string; inserted: string; suffix: string }) => {
    const who = suggestAuthor?.name ? esc(suggestAuthor.name) : "";
    const kind = st.deleted && st.inserted ? " · edit" : st.inserted ? " · insertion" : " · deletion";
    const attrs = who ? ` data-author="${who}" title="${who}${kind}"` : "";
    /* NO contenteditable=false here (unlike the settled widget): a nested editable island loses
       focus the moment innerHTML is replaced, which would swallow every keystroke after the
       first. This controller intercepts every edit anyway, so the block stays ONE editable host
       and the caret can sit naturally inside the <ins>. */
    const chg = st.deleted || st.inserted
      ? `<span class="ne-chg is-live" data-cid="${LIVE_CID}"${attrs}><del>${inlineMd(esc(st.deleted))}</del><ins>${inlineMd(esc(st.inserted))}</ins></span>`
      : "";
    return inlineMd(esc(st.prefix)) + chg + inlineMd(esc(st.suffix));
  };

  // put the caret back exactly where the edit left it: inside <ins> at `caret`, or — when there
  // is no insertion (a pure deletion) — immediately after the struck text, at the suffix start.
  const placeTrackedCaret = (el: HTMLElement, st: { inserted: string; caret: number }) => {
    const sel = window.getSelection(); if (!sel) return;
    const range = document.createRange();
    const ins = el.querySelector("ins");
    const span = el.querySelector(".ne-chg");
    if (st.inserted.length > 0 && ins?.firstChild) {
      const t = ins.firstChild as Text;
      range.setStart(t, Math.max(0, Math.min(st.caret, (t.textContent || "").length)));
    } else if (span) {
      const after = span.nextSibling;
      if (after && after.nodeType === Node.TEXT_NODE) range.setStart(after, 0);
      else range.setStartAfter(span);
    } else { range.selectNodeContents(el); range.collapse(false); }
    range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
  };

  // start (or resume) tracking this block: seed the model from the committed text + any change
  // already pending on it, and map the live caret into `inserted`
  const ensureSuggestEdit = (blockId: string, el: HTMLElement) => {
    if (sEdit.current?.blockId === blockId) return;
    const b = blocks.find((x) => x.id === blockId);
    const text = b && "text" in b ? (b as { text: string }).text : "";
    const existing = pendingChanges.find((c) => c.blockId === blockId);
    const caretAt = caretText(el).before.length;
    if (existing) {
      const prefix = text.slice(0, existing.offset ?? 0);
      const deleted = existing.original;
      const inserted = existing.replacement;
      const suffix = text.slice((existing.offset ?? 0) + existing.original.length);
      const insStart = prefix.length + deleted.length;
      sEdit.current = { blockId, prefix, deleted, inserted, suffix, caret: Math.max(0, Math.min(inserted.length, caretAt - insStart)) };
    } else {
      sEdit.current = { blockId, prefix: text.slice(0, caretAt), deleted: "", inserted: "", suffix: text.slice(caretAt), caret: 0 };
    }
  };

  // render + restore caret + report the change — all synchronously inside the input event
  const commitSuggest = (el: HTMLElement) => {
    const st = sEdit.current; if (!st) return;
    el.innerHTML = trackedHtml(st);
    // replacing innerHTML can drop focus; take it back BEFORE restoring the caret so the next
    // keystroke lands in this block (otherwise only the first character is ever captured)
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    placeTrackedCaret(el, st);
    onSuggestChange?.(st.blockId, st.deleted || st.inserted ? { original: st.deleted, replacement: st.inserted, offset: st.prefix.length } : null);
  };

  /* keep the model's caret in step with where the user actually clicked: the caret is only
     authoritative while it sits inside the insertion — before anything is typed we re-split the
     committed text at the live caret so the edit starts where they put it. */
  const syncSuggestCaret = (el: HTMLElement, st: NonNullable<typeof sEdit.current>) => {
    const caretAt = caretText(el).before.length;
    if (!st.deleted && !st.inserted) {
      const full = st.prefix + st.suffix;
      const at = Math.max(0, Math.min(full.length, caretAt));
      st.prefix = full.slice(0, at); st.suffix = full.slice(at); st.caret = 0;
      return;
    }
    const insStart = st.prefix.length + st.deleted.length;
    st.caret = Math.max(0, Math.min(st.inserted.length, caretAt - insStart));
  };

  /* fold a non-collapsed selection into the model as a deletion, so "select some words and type"
     (the substitution case) strikes the old text and colours the new one in one gesture */
  const foldSelection = (el: HTMLElement, st: NonNullable<typeof sEdit.current>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    const end = start + r.toString().length;
    const insStart = st.prefix.length + st.deleted.length;
    const insEnd = insStart + st.inserted.length;
    // the part of the selection inside the insertion is simply removed (it was never committed)
    const iFrom = Math.max(0, Math.min(st.inserted.length, start - insStart));
    const iTo = Math.max(0, Math.min(st.inserted.length, end - insStart));
    if (iTo > iFrom) { st.inserted = st.inserted.slice(0, iFrom) + st.inserted.slice(iTo); st.caret = iFrom; }
    // committed text caught on either side becomes struck-through
    if (start < st.prefix.length) {
      const cut = st.prefix.slice(start);
      st.deleted = cut + st.deleted; st.prefix = st.prefix.slice(0, start); st.caret = Math.min(st.caret, st.inserted.length);
    }
    if (end > insEnd) {
      const take = Math.min(st.suffix.length, end - insEnd);
      st.deleted = st.deleted + st.suffix.slice(0, take); st.suffix = st.suffix.slice(take);
    }
    if (st.inserted.length === 0) st.caret = 0;
  };

  /* the interception itself — one delegated native listener (React's synthetic onBeforeInput
     does not carry a reliable inputType). Only text-bearing edits are taken over. */
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || !suggesting || readOnly) return;
    const onBeforeInput = (ev: Event) => {
      const e = ev as InputEvent;
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(".ne-block") as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      const blockId = Object.keys(elRefs.current).find((k) => elRefs.current[k] === el);
      if (!blockId) return;
      const b = blocks.find((x) => x.id === blockId);
      if (!b || !TEXTLIKE.has(b.type)) return;   // code/table/image keep their own editing
      const it = e.inputType;

      if (it === "insertParagraph" || it === "insertLineBreak") {
        // finalise the tracked edit and open a fresh line (structural edits are not tracked in v1)
        e.preventDefault();
        sEdit.current = null;
        const idx = blocks.findIndex((x) => x.id === b.id);
        const nb: Block = { id: bid(), type: "p", text: "" };
        const next = [...blocks]; next.splice(idx + 1, 0, nb); update(next); focusBlock(nb.id);
        return;
      }
      const isInsert = it === "insertText" || it === "insertFromPaste" || it === "insertReplacementText";
      const isDelBack = it === "deleteContentBackward" || it === "deleteWordBackward";
      const isDelFwd = it === "deleteContentForward" || it === "deleteWordForward";
      if (!isInsert && !isDelBack && !isDelFwd) return;   // composition & the rest fall through

      const data = it === "insertFromPaste" ? (e.dataTransfer?.getData("text/plain") ?? "") : (e.data ?? "");
      e.preventDefault();
      ensureSuggestEdit(blockId, el);
      const st = sEdit.current!;
      syncSuggestCaret(el, st);
      foldSelection(el, st);
      if (isInsert) {
        if (!data) { commitSuggest(el); return; }
        st.inserted = st.inserted.slice(0, st.caret) + data + st.inserted.slice(st.caret);
        st.caret += data.length;
      } else if (isDelBack) {
        if (st.caret > 0) { st.inserted = st.inserted.slice(0, st.caret - 1) + st.inserted.slice(st.caret); st.caret -= 1; }
        else if (st.prefix.length > 0) { st.deleted = st.prefix.slice(-1) + st.deleted; st.prefix = st.prefix.slice(0, -1); }
      } else {
        if (st.caret < st.inserted.length) st.inserted = st.inserted.slice(0, st.caret) + st.inserted.slice(st.caret + 1);
        else if (st.suffix.length > 0) { st.deleted = st.deleted + st.suffix.slice(0, 1); st.suffix = st.suffix.slice(1); }
      }
      commitSuggest(el);
    };
    root.addEventListener("beforeinput", onBeforeInput);
    return () => root.removeEventListener("beforeinput", onBeforeInput);
  });

  // leaving the block ends the tracked edit; the change already lives in the model
  React.useEffect(() => { if (!suggesting) sEdit.current = null; }, [suggesting]);

  // anchor the slash menu to the caret (the "/"), and keep it inside the viewport
  function caretAnchor(blockId: string) {
    const MW = 252, MH = 336;
    const sel = window.getSelection();
    let rect: DOMRect | null = null;
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).cloneRange();
      const rects = r.getClientRects();
      rect = (rects.length ? rects[rects.length - 1] : r.getBoundingClientRect()) as DOMRect;
    }
    if (!rect || (rect.left === 0 && rect.top === 0)) { const e = elRefs.current[blockId]?.getBoundingClientRect(); if (e) rect = e as DOMRect; }
    const cx = rect ? rect.left : 200, cbottom = rect ? rect.bottom : 200, ctop = rect ? rect.top : 200;
    const above = cbottom + MH > window.innerHeight - 12;
    const x = Math.max(12, Math.min(cx, window.innerWidth - MW - 12));
    const y = above ? ctop - 6 : cbottom + 6;
    return { x, y, above };
  }
  function openMenuFor(blockId: string, query: string) {
    setMenu((m) => {
      if (m && m.blockId === blockId) return { ...m, query, sel: 0 }; // keep it stuck where "/" was typed
      const a = caretAnchor(blockId);
      return { blockId, query, sel: 0, ...a };
    });
  }
  function openPageMenu(blockId: string, query: string, stripLen: number) {
    setPageMenu((m) => (m && m.blockId === blockId ? { ...m, query, stripLen, sel: 0 } : { blockId, query, stripLen, sel: 0, ...caretAnchor(blockId) }));
  }
  // replace the `[[query` / `@query` trigger before the caret with a page-link token (or
  // create a new page from the query when "New page" is chosen)
  function insertPageLink(blockId: string, pageId: string, title: string) {
    const pm = pageMenu; setPageMenu(null);
    const el = elRefs.current[blockId]; const cur = blocks.find((b) => b.id === blockId);
    if (!el || !cur || !("text" in cur) || !pm) return;
    const { before, after } = caretText(el);
    const head = before.slice(0, Math.max(0, before.length - pm.stripLen));
    const newText = `${head}[[page:${pageId}|${title}]]${after}`;
    el.innerHTML = buildBlockHtml(newText, changesFor(cur));
    patchBlock(blockId, { text: newText } as Partial<Block>);
    requestAnimationFrame(() => focusBlock(blockId, true));
  }
  function chooseFromPageMenu(blockId: string, choice: { id: string; title: string; icon?: string } | "new") {
    if (!pageContext) { setPageMenu(null); return; }
    if (choice === "new") { const title = (pageMenu?.query || "").trim() || "Untitled"; const id = pageContext.onCreateSubPage(title); insertPageLink(blockId, id, pageContext.resolve(id)?.title || title); }
    else insertPageLink(blockId, choice.id, choice.title);
  }

  function applyCommand(blockId: string, cmd: Cmd) {
    setMenu(null);
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    if (cmd.key === "divider") {
      const nb: Block = { id: bid(), type: "divider" };
      const after: Block = { id: bid(), type: "p", text: "" };
      const next = [...blocks]; next.splice(idx, 1, nb, after); update(next);
      focusBlock(after.id); return;
    }
    if (cmd.key === "image") {
      imgTargetRef.current = blockId;
      // clear the "/" text on the block, keep it as a placeholder paragraph
      patchBlock(blockId, { type: "p", text: "" } as Partial<Block>);
      if (elRefs.current[blockId]) elRefs.current[blockId]!.textContent = "";
      fileRef.current?.click(); return;
    }
    if (cmd.key === "table") {
      const nb: Block = { id: bid(), type: "table", rows: [["", "", ""], ["", "", ""], ["", "", ""]] };
      const after: Block = { id: bid(), type: "p", text: "" };
      const next = [...blocks]; next.splice(idx, 1, nb, after); update(next);
      focusBlock(after.id); return;
    }
    if (cmd.key === "page") {
      if (!pageContext) return;
      // "turn into a page": the line's text (minus the /query) becomes the new page's title
      const cur = blocks[idx];
      const curText = (cur && "text" in cur ? cur.text : "").replace(/(^|\s)\/[^\s/]*$/, "$1").trim();
      const newId = pageContext.onCreateSubPage(curText || "Untitled");
      const info = pageContext.resolve(newId);
      const pb: Block = { id: bid(), type: "page", pageId: newId, title: info?.title ?? (curText || "Untitled"), icon: info?.icon };
      const after: Block = { id: bid(), type: "p", text: "" };
      if (elRefs.current[blockId]) elRefs.current[blockId]!.textContent = "";
      const next = [...blocks]; next.splice(idx, 1, pb, after); update(next);
      focusBlock(after.id); return;
    }
    // text-like transform: strip the "/query" token the menu was triggered by, keep the rest
    const cur = blocks[idx];
    const keepText = cur.type === "divider" || cur.type === "image" || cur.type === "table" ? "" : (cur as { text: string }).text.replace(/(^|\s)\/[^\s/]*$/, "$1");
    if (elRefs.current[blockId]) elRefs.current[blockId]!.textContent = keepText;
    patchBlock(blockId, { type: cmd.key, text: keepText } as Partial<Block>);
    focusBlock(blockId);
  }

  function onTextInput(b: Block, el: HTMLElement) {
    const text = serializeBlock(el, pendingChanges);
    // markdown shortcut: an exact marker+space on a plain paragraph converts the block
    if (mdOn && b.type === "p") {
      const sc = mdShortcut(text);
      if (sc) {
        if (el) el.textContent = "";
        if (sc.type === "divider") {
          const idx = blocks.findIndex((x) => x.id === b.id);
          const after: Block = { id: bid(), type: "p", text: "" };
          const next = [...blocks]; next.splice(idx, 1, { id: b.id, type: "divider" }, after); update(next);
          focusBlock(after.id); return;
        }
        patchBlock(b.id, sc); focusBlock(b.id); return;
      }
    }
    patchBlock(b.id, { text } as Partial<Block>);
    const before = caretText(el).before;
    // "/" opens the slash menu at line start or right after a space (Notion-style)
    if (slashOn) {
      const m = before.match(/(?:^|\s)\/([^\s/]*)$/);
      if (m) openMenuFor(b.id, m[1]);
      else if (menu?.blockId === b.id) setMenu(null);
    }
    // "[[query" or "@query" opens the page-link autocomplete (only with a pageContext)
    if (pageContext && b.type !== "code") {
      const mm = before.match(/\[\[([^[\]\n]*)$/);
      const at = mm ? null : before.match(/(?:^|\s)@([^\s@]{0,40})$/);
      if (mm) openPageMenu(b.id, mm[1], mm[1].length + 2);
      else if (at) openPageMenu(b.id, at[1], at[1].length + 1);
      else if (pageMenu?.blockId === b.id) setPageMenu(null);
    }
  }

  function onTextKeyDown(e: React.KeyboardEvent, b: Block) {
    const el = e.currentTarget as HTMLElement;
    if (menu && menu.blockId === b.id) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenu({ ...menu, sel: Math.min(menu.sel + 1, filtered.length - 1) }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenu({ ...menu, sel: Math.max(menu.sel - 1, 0) }); return; }
      if (e.key === "Enter") { e.preventDefault(); if (filtered[menu.sel]) applyCommand(b.id, filtered[menu.sel]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMenu(null); return; }
    }
    if (pageMenu && pageMenu.blockId === b.id) {
      const total = pageResults.length + 1; // + the "New page" row
      if (e.key === "ArrowDown") { e.preventDefault(); setPageMenu({ ...pageMenu, sel: Math.min(pageMenu.sel + 1, total - 1) }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPageMenu({ ...pageMenu, sel: Math.max(pageMenu.sel - 1, 0) }); return; }
      if (e.key === "Enter") { e.preventDefault(); chooseFromPageMenu(b.id, pageMenu.sel < pageResults.length ? pageResults[pageMenu.sel] : "new"); return; }
      if (e.key === "Escape") { e.preventDefault(); setPageMenu(null); return; }
    }
    const idx = blocks.findIndex((x) => x.id === b.id);
    const curIndent = (("indent" in b && b.indent) || 0) as number;

    // Tab / Shift-Tab → nesting level (keyboard-first, works on any indentable block)
    if (e.key === "Tab" && INDENTABLE.has(b.type)) {
      e.preventDefault();
      const next = e.shiftKey ? Math.max(0, curIndent - 1) : Math.min(MAX_INDENT, curIndent + 1);
      if (next !== curIndent) patchBlock(b.id, { indent: next } as Partial<Block>);
      return;
    }

    // code block OWNS Enter — a plain newline inside; Enter on a trailing blank line exits
    if (b.type === "code" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const { before, after } = caretText(el);
      if (after === "" && /\n$/.test(before)) {
        const trimmed = (b.text || "").replace(/\n$/, "");
        const p: Block = { id: bid(), type: "p", text: "" };
        const next = blocks.map((x) => (x.id === b.id ? { ...x, text: trimmed } as Block : x));
        next.splice(next.findIndex((x) => x.id === b.id) + 1, 0, p); update(next); focusBlock(p.id); return;
      }
      document.execCommand("insertText", false, "\n"); // fires input → onTextInput serializes
      return;
    }

    const hasChanges = changesFor(b).length > 0;
    if (e.key === "Enter" && !e.shiftKey && hasChanges) {
      // don't split a block that carries tracked-change widgets — just open a fresh line
      e.preventDefault(); addBlockAfter(b.id); return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const { before, after } = caretText(el);
      // list / todo: Enter on an empty item exits to a paragraph (drops one indent level first)
      if ((b.type === "ul" || b.type === "ol" || b.type === "todo") && before === "" && after === "") {
        if (curIndent > 0) { patchBlock(b.id, { indent: curIndent - 1 } as Partial<Block>); return; }
        patchBlock(b.id, { type: "p", indent: 0 } as Partial<Block>); if (elRefs.current[b.id]) elRefs.current[b.id]!.textContent = ""; return;
      }
      el.textContent = before;
      // toggle: Enter creates its FIRST child (indent+1) and reveals the toggle
      if (b.type === "toggle") {
        const child: Block = { id: bid(), type: "p", text: after, indent: curIndent + 1 };
        const next = [...blocks]; next[idx] = { ...b, text: before, collapsed: false } as Block; next.splice(idx + 1, 0, child); update(next);
        focusBlock(child.id, false); return;
      }
      // list/todo continue same type (carry indent + checkbox reset); everything else → paragraph
      const contType: Block["type"] = b.type === "ul" || b.type === "ol" || b.type === "todo" ? b.type : "p";
      const nb: Block = contType === "todo"
        ? { id: bid(), type: "todo", text: after, checked: false, indent: curIndent }
        : { id: bid(), type: contType, text: after, indent: curIndent } as Block;
      const next = [...blocks]; next[idx] = { ...b, text: before } as Block; next.splice(idx + 1, 0, nb); update(next);
      focusBlock(nb.id, false); return;
    }
    if (e.key === "Backspace" && caretAtStart(el)) {
      // an indented block first outdents (matches list behaviour) before it merges up
      if (curIndent > 0) { e.preventDefault(); patchBlock(b.id, { indent: curIndent - 1 } as Partial<Block>); return; }
      const prev = blocks[idx - 1];
      if (idx === 0) return;
      if (prev && (prev.type === "divider" || prev.type === "image" || prev.type === "table" || prev.type === "page")) {
        // delete the non-text block above
        e.preventDefault();
        const next = blocks.filter((x) => x.id !== prev.id); update(next); focusBlock(b.id, false); return;
      }
      if (prev && TEXTLIKE.has(prev.type)) {
        e.preventDefault();
        const prevText = (prev as { text: string }).text;
        const merged = prevText + (el.textContent || "");
        const next = blocks.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? { ...x, text: merged } as Block : x));
        if (elRefs.current[prev.id]) elRefs.current[prev.id]!.textContent = merged;
        update(next);
        // place caret at the join point
        requestAnimationFrame(() => {
          const pe = elRefs.current[prev.id]; if (!pe) return; pe.focus();
          const sel = window.getSelection(); const range = document.createRange();
          const tn = pe.firstChild || pe; range.setStart(tn, prevText.length); range.collapse(true);
          sel?.removeAllRanges(); sel?.addRange(range);
        });
        return;
      }
    }
  }

  // which block sits under a drop point (so a dropped image lands where you aimed)
  function blockIdAtY(y: number): string | undefined {
    let best: { id: string; d: number } | null = null;
    for (const b of blocks) {
      const el = elRefs.current[b.id]?.closest(".ne-row") as HTMLElement | null;
      const r = el?.getBoundingClientRect(); if (!r) continue;
      if (y >= r.top && y <= r.bottom) return b.id;
      const d = y < r.top ? r.top - y : y - r.bottom;
      if (!best || d < best.d) best = { id: b.id, d };
    }
    return best?.id;
  }
  async function insertImages(files: FileList | File[], afterId?: string) {
    const uris: string[] = [];
    for (const f of Array.from(files)) { const u = await fileToDataUri(f); if (u) uris.push(u); }
    if (!uris.length) return;
    const imgs: Block[] = uris.map((src) => ({ id: bid(), type: "image", src }));
    let next = [...blocks];
    const at = afterId ? next.findIndex((b) => b.id === afterId) : -1;
    // insert exactly where aimed; only add a trailing line when images land at the very end
    if (at >= 0) next.splice(at + 1, 0, ...imgs);
    else { const tail: Block = { id: bid(), type: "p", text: "" }; next = [...next, ...imgs, tail]; }
    update(next); // no scroll/refocus — the image just appears in place
  }

  function addBlockAfter(blockId: string) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    const nb: Block = { id: bid(), type: "p", text: "" };
    const next = [...blocks]; next.splice(idx + 1, 0, nb); update(next); focusBlock(nb.id);
  }
  // the mobile "+" path: a fresh line PLUS the slash menu, so every block type is reachable
  // without a physical "/" key
  function addBlockAndMenu(blockId: string) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    const nb: Block = { id: bid(), type: "p", text: "" };
    const next = [...blocks]; next.splice(idx + 1, 0, nb); update(next);
    requestAnimationFrame(() => { const el = elRefs.current[nb.id]; if (el) { el.focus(); if (slashOn) openMenuFor(nb.id, ""); } });
  }
  function removeBlock(blockId: string) { update(blocks.filter((b) => b.id !== blockId)); }

  /* move a block one slot up/down — the keyboard/touch equivalent of dragging it, and the
     only way to reorder without a hover handle or a precise drag */
  function nudgeBlock(blockId: string, dir: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === blockId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }

  // per-type mutations
  const toggleCheck = (id: string, checked: boolean) => patchBlock(id, { checked } as Partial<Block>);
  const setCollapse = (id: string, collapsed: boolean) => patchBlock(id, { collapsed } as Partial<Block>);
  const setCalloutEmoji = (id: string, emoji: string) => patchBlock(id, { emoji } as Partial<Block>);
  const setCodeLang = (id: string, lang: string) => patchBlock(id, { lang } as Partial<Block>);

  // collapsed-toggle descendants are hidden: a collapsed toggle at indent L hides the
  // contiguous run of following blocks whose indent is deeper than L (nested toggles too)
  const hiddenIds = React.useMemo(() => {
    const hidden = new Set<string>();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === "toggle" && b.collapsed) {
        const L = ("indent" in b ? b.indent : 0) || 0;
        for (let j = i + 1; j < blocks.length; j++) {
          const nb = blocks[j]; const nl = ("indent" in nb ? nb.indent : 0) || 0;
          if (nl > L) hidden.add(nb.id); else break;
        }
      }
    }
    return hidden;
  }, [blocks]);

  // pointer-based reorder for TOUCH (desktop keeps native HTML5 DnD for its ghost image);
  // reuses the `drag` drop-line feedback, resolves the target by Y, drops via onRowDrop
  function startTouchDrag(e: React.PointerEvent, blockId: string) {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    setDrag({ id: blockId, overId: null, pos: "after" });
    const move = (ev: PointerEvent) => {
      const overId = blockIdAtY(ev.clientY);
      if (!overId || overId === blockId) return;
      const el = elRefs.current[overId]?.closest(".ne-row") as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      const pos: "before" | "after" = r && ev.clientY < r.top + r.height / 2 ? "before" : "after";
      setDrag((d) => (d ? { ...d, overId, pos } : d));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); onRowDrop(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // dismiss the block-actions menu on any outside interaction
  React.useEffect(() => {
    if (!blockMenu) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest(".ne-blockmenu, .ne-h-grip")) setBlockMenu(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [blockMenu]);

  // paste normalization: Word / Google-Docs / web HTML (or multi-line markdown) → clean
  // blocks; replaces the current empty block, else splices after. A simple inline paste
  // falls through to the browser default.
  function onPasteBlock(e: React.ClipboardEvent, b: Block) {
    if (readOnly) return;
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    let parsed: Block[] | null = null;
    if (html && /<(h[1-6]|ul|ol|li|table|pre|blockquote|div|p|img|hr)\b/i.test(html)) parsed = htmlToBlocks(html);
    else if (plain && (/\n/.test(plain.trim()) || /^(#{1,3}\s|[-*+]\s|\d+[.)]\s|>\s|```)/.test(plain.trim()))) parsed = markdownToBlocks(plain);
    if (!parsed || !parsed.length) return;
    e.preventDefault();
    const idx = blocks.findIndex((x) => x.id === b.id);
    const curEmpty = TEXT_BEARING.has(b.type) && !((b as { text?: string }).text || "").trim();
    const next = [...blocks];
    if (curEmpty) next.splice(idx, 1, ...parsed); else next.splice(idx + 1, 0, ...parsed);
    update(next);
    focusBlock(parsed[parsed.length - 1].id);
  }

  /* pending changes whose original text lives in THIS block (drives inline tracked changes) */
  function changesFor(b: Block): InlineChange[] {
    if (b.type === "divider" || b.type === "image" || b.type === "table" || b.type === "page") return [];
    const t = (b as Extract<Block, { text: string }>).text;
    // a change ANCHORED to a block (blockId set — the live-capture path) belongs only to that
    // block; an un-anchored change (server-proposed substitution) is matched by its original
    // substring as before. This keeps insertions/deletions (empty original) from matching
    // every block via includes("").
    return pendingChanges.filter((c) => (c.blockId ? c.blockId === b.id : c.original !== "" && t.includes(c.original)));
  }

  /* drag-to-reorder — grabbed by the handle grip; a drop line marks the target slot */
  function onRowDragOver(e: React.DragEvent, overId: string) {
    if (!drag || drag.id === overId) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: "before" | "after" = e.clientY < r.top + r.height / 2 ? "before" : "after";
    if (drag.overId !== overId || drag.pos !== pos) setDrag({ ...drag, overId, pos });
  }
  function onRowDrop() {
    const d = dragRef.current; // latest drag (window pointer listeners hold a stale closure)
    if (!d || !d.overId || d.id === d.overId) { setDrag(null); return; }
    const moved = blocks.find((b) => b.id === d.id);
    if (!moved) { setDrag(null); return; }
    const without = blocks.filter((b) => b.id !== d.id);
    let to = without.findIndex((b) => b.id === d.overId);
    if (d.pos === "after") to += 1;
    const next = [...without.slice(0, to), moved, ...without.slice(to)];
    setDrag(null);
    update(next);
  }

  /* table helpers */
  function setCell(bId: string, r: number, c: number, val: string) {
    update(blocks.map((b) => { if (b.id !== bId || b.type !== "table") return b; const rows = b.rows.map((row) => [...row]); rows[r][c] = val; return { ...b, rows }; }));
  }
  function tableAddRow(bId: string) { update(blocks.map((b) => (b.id === bId && b.type === "table" ? { ...b, rows: [...b.rows, b.rows[0].map(() => "")] } : b))); }
  function tableAddCol(bId: string) { update(blocks.map((b) => (b.id === bId && b.type === "table" ? { ...b, rows: b.rows.map((row) => [...row, ""]) } : b))); }

  const TAG: Record<string, keyof React.JSX.IntrinsicElements> = { h1: "h1", h2: "h2", h3: "h3", quote: "blockquote", p: "p", ul: "div", ol: "div", todo: "div", toggle: "div", callout: "div" };

  // ordered-list number, scoped to the contiguous same-indent run (so nested lists restart)
  const olNumber = (idx: number, indent: number) => {
    let n = 1;
    for (let j = idx - 1; j >= 0; j--) {
      const x = blocks[j]; const xi = ("indent" in x ? x.indent : 0) || 0;
      if (xi < indent) break;
      if (xi === indent) { if (x.type === "ol") n++; else break; }
    }
    return n;
  };

  // the shared editable text element (contenteditable) used by paragraphs, headings,
  // lists, todo, toggle and callout — one caret-safe implementation, tracked-changes and
  // inline marks included. `code` renders its own (highlighted) surface.
  const editableText = (b: Block, ph?: string, extraCls = "") => {
    const mine = changesFor(b);
    const bText = (b as Extract<Block, { text: string }>).text;
    const placeholder = ph ?? (b.type === "h1" ? "Heading" : b.type === "h2" || b.type === "h3" ? "Heading" : b.type === "p" ? "Type '/' for commands…" : "");
    return React.createElement((TAG[b.type] || "div") as string, {
      className: `ne-block ne-${b.type}${mine.length ? " ne-has-chg" : ""}${extraCls}`,
      contentEditable: !readOnly,
      suppressContentEditableWarning: true,
      "data-testid": `edit-${b.id}`,
      "data-ph": placeholder,
      ref: (el: HTMLElement | null): void => {
        elRefs.current[b.id] = el;
        if (!el || document.activeElement === el) return;
        const html = buildBlockHtml(bText, mine);
        if (el.innerHTML !== html) el.innerHTML = html;
      },
      onInput: (e: React.FormEvent<HTMLElement>) => onTextInput(b, e.currentTarget),
      // on blur, reconcile the DOM back to the model. In suggesting mode the block's committed
      // text stays the ORIGINAL while a tracked change holds the edit, so the widget only
      // materializes once focus leaves (the focus guard keeps typing caret-safe) — this is what
      // renders the del/ins after a suggested edit. In normal editing it is a no-op (the built
      // html already equals the typed text).
      onBlur: (e: React.FocusEvent<HTMLElement>) => { const el = e.currentTarget; const html = buildBlockHtml(bText, mine); if (el.innerHTML !== html) el.innerHTML = html; },
      onKeyDown: (e: React.KeyboardEvent) => onTextKeyDown(e, b),
      onPaste: (e: React.ClipboardEvent) => onPasteBlock(e, b),
      onMouseOver: mine.length ? (e: React.MouseEvent) => { const s = (e.target as HTMLElement).closest?.("[data-cid]"); onHoverChange?.(s ? s.getAttribute("data-cid") : null); } : undefined,
      onMouseLeave: mine.length ? () => onHoverChange?.(null) : undefined,
    });
  };

  // a file drag (external image) shows the drop banner; an internal block drag never does
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types || []).includes("Files");
  // click anywhere in the empty canvas → focus the last text line at its end (Notion feel)
  function onCanvasMouseDown(e: React.MouseEvent) {
    if (readOnly) return;
    const t = e.target as HTMLElement;
    if (t.closest(".ne-block,.ne-cell,.ne-cap,.ne-handle,.ne-menu,.ne-image,.ne-table,button,input")) return;
    const last = [...blocks].reverse().find((b) => TEXTLIKE.has(b.type));
    if (last) { e.preventDefault(); focusBlock(last.id, true); }
  }

  return (
    <div
      ref={rootRef}
      className={`ne-root${dragOver ? " is-filedrag" : ""}${readOnly ? " is-ro" : ""}`}
      onMouseDown={onCanvasMouseDown}
      onClick={(e) => { const pl = (e.target as HTMLElement).closest?.("[data-page]"); if (pl && pageContext) { e.preventDefault(); pageContext.onOpenPage(pl.getAttribute("data-page")!); } }}
      onDragOver={(e) => { if (readOnly || !isFileDrag(e)) return; e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { if (readOnly || !isFileDrag(e)) return; e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void insertImages(e.dataTransfer.files, blockIdAtY(e.clientY)); }}
    >
      <style>{NE_CSS}</style>
      {dragOver && <div className="ne-drop"><ImagePlus size={18} /> Drop image</div>}

      {blocks.map((b) => {
        if (hiddenIds.has(b.id)) return null; // inside a collapsed toggle
        const indent = ("indent" in b ? b.indent : 0) || 0;
        const rowCls = (extra = "") => `ne-row${extra}${drag?.id === b.id ? " is-dragging" : ""}` +
          (drag && drag.overId === b.id ? (drag.pos === "before" ? " drop-before" : " drop-after") : "");
        const rowProps = {
          "data-testid": `block-${b.id}`,
          "data-block-type": b.type,
          style: indent ? { marginInlineStart: `${indent * 26}px` } : undefined,
          draggable: grabId === b.id,
          onDragStart: (e: React.DragEvent) => {
            setDrag({ id: b.id, overId: null, pos: "after" });
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", b.id); } catch { /* noop */ }
            // a slim custom drag image instead of the heavy full-row snapshot
            const preview = b.type === "image" ? "Image" : b.type === "table" ? "Table" : b.type === "divider" ? "Divider" : ((b as { text?: string }).text || "Empty line");
            const ghost = document.createElement("div");
            ghost.className = "ne-ghost";
            ghost.textContent = preview.slice(0, 42) + (preview.length > 42 ? "…" : "");
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 12, 14);
            setTimeout(() => ghost.remove(), 0);
          },
          onDragEnd: () => { setGrabId(null); setDrag(null); },
          onDragOver: (e: React.DragEvent) => { if (drag) onRowDragOver(e, b.id); },
          onDrop: (e: React.DragEvent) => { if (drag) { e.preventDefault(); e.stopPropagation(); onRowDrop(); } },
        };
        const onGripPointerDown = (e: React.PointerEvent) => { if (e.pointerType === "touch") startTouchDrag(e, b.id); else setGrabId(b.id); };
        const handle = !readOnly && (
          <BlockHandle onAdd={() => addBlockAndMenu(b.id)} onDel={() => removeBlock(b.id)} onGripPointerDown={onGripPointerDown}
            menuOpen={blockMenu === b.id} onMenu={() => setBlockMenu((m) => (m === b.id ? null : b.id))}
            onCloseMenu={() => setBlockMenu(null)} onUp={() => nudgeBlock(b.id, -1)} onDown={() => nudgeBlock(b.id, 1)} />
        );

        if (b.type === "divider") return (
          <div key={b.id} className={rowCls(" ne-divider-row")} {...rowProps}>
            {handle}
            <hr className="ne-divider" />
          </div>
        );
        if (b.type === "image") return (
          <div key={b.id} className={rowCls(" ne-image-row")} {...rowProps}>
            {handle}
            <figure className="ne-image">
              <img src={b.src} alt={b.caption || ""} />
              {!readOnly && <button className="ne-img-x" aria-label="Remove image" onClick={() => removeBlock(b.id)}><X size={13} /></button>}
              <figcaption
                className="ne-cap" contentEditable={!readOnly} suppressContentEditableWarning
                data-ph="Write a caption…"
                ref={(el) => { if (el && el.textContent !== (b.caption || "") && document.activeElement !== el) el.textContent = b.caption || ""; }}
                onInput={(e) => patchBlock(b.id, { caption: (e.currentTarget.textContent || "") } as Partial<Block>)}
              />
            </figure>
          </div>
        );
        if (b.type === "table") return (
          <div key={b.id} className={rowCls(" ne-table-row")} {...rowProps}>
            {handle}
            <div className="ne-table-wrap">
              <table className="ne-table"><tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>{row.map((cell, c) => (
                    <td key={c}>
                      <div className={`ne-cell${r === 0 ? " ne-cell-h" : ""}`} contentEditable={!readOnly} suppressContentEditableWarning
                        data-ph={r === 0 ? "Header" : ""}
                        ref={(el) => { if (el && el.textContent !== cell && document.activeElement !== el) el.textContent = cell; }}
                        onInput={(e) => setCell(b.id, r, c, e.currentTarget.textContent || "")} />
                    </td>
                  ))}</tr>
                ))}
              </tbody></table>
              {!readOnly && (
                <div className="ne-table-ctl">
                  <button onClick={() => tableAddRow(b.id)}><Plus size={12} /> Row</button>
                  <button onClick={() => tableAddCol(b.id)}><Plus size={12} /> Column</button>
                </div>
              )}
            </div>
          </div>
        );
        if (b.type === "code") return (
          <div key={b.id} className={rowCls(" ne-code-row")} {...rowProps}>
            {handle}
            <div className="ne-code">
              <div className="ne-code-head" contentEditable={false}>
                <select className="ne-code-lang" value={b.lang || "plain"} disabled={readOnly} aria-label="Code language"
                  onChange={(e) => setCodeLang(b.id, e.target.value)}>
                  {CODE_LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                {!readOnly && <button className="ne-code-copy" title="Copy code" onMouseDown={(e) => { e.preventDefault(); try { navigator.clipboard?.writeText(b.text); } catch { /* noop */ } }}><Copy size={12.5} /></button>}
              </div>
              <pre className="ne-code-body" contentEditable={!readOnly} suppressContentEditableWarning spellCheck={false}
                data-testid={`edit-${b.id}`}
                ref={(el: HTMLElement | null) => { elRefs.current[b.id] = el; if (!el || document.activeElement === el) return; const html = highlightCode(b.text, b.lang); if (el.innerHTML !== html) el.innerHTML = html; }}
                onBlur={(e) => { e.currentTarget.innerHTML = highlightCode(b.text, b.lang); }}
                onInput={(e) => patchBlock(b.id, { text: e.currentTarget.textContent || "" } as Partial<Block>)}
                onKeyDown={(e) => onTextKeyDown(e, b)}
                onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
              />
            </div>
          </div>
        );
        if (b.type === "todo") return (
          <div key={b.id} className={rowCls(" ne-todo-row")} {...rowProps}>
            {handle}
            <button className={`ne-check${b.checked ? " is-checked" : ""}`} role="checkbox" aria-checked={!!b.checked} data-testid={`todo-check-${b.id}`}
              disabled={readOnly} onMouseDown={(e) => { e.preventDefault(); if (!readOnly) toggleCheck(b.id, !b.checked); }}>
              {b.checked && <Check size={13} strokeWidth={3} />}
            </button>
            {editableText(b, "To-do", b.checked ? " is-done" : "")}
          </div>
        );
        if (b.type === "toggle") return (
          <div key={b.id} className={rowCls(" ne-toggle-row")} {...rowProps}>
            {handle}
            <button className={`ne-tw${b.collapsed ? "" : " is-open"}`} aria-label={b.collapsed ? "Expand" : "Collapse"} aria-expanded={!b.collapsed} data-testid={`toggle-btn-${b.id}`}
              onMouseDown={(e) => { e.preventDefault(); setCollapse(b.id, !b.collapsed); }}>
              <ChevronRight size={16} />
            </button>
            {editableText(b, "Toggle")}
          </div>
        );
        if (b.type === "callout") return (
          <div key={b.id} className={rowCls(" ne-callout-row")} {...rowProps}>
            {handle}
            <div className={`ne-callout-box ne-tone-${b.tone || "info"}`}>
              <button className="ne-callout-emoji" disabled={readOnly} title="Change icon" data-testid={`callout-emoji-${b.id}`}
                onMouseDown={(e) => { e.preventDefault(); if (!readOnly) { const cur = CALLOUT_EMOJIS.indexOf(b.emoji || "💡"); setCalloutEmoji(b.id, CALLOUT_EMOJIS[(cur + 1) % CALLOUT_EMOJIS.length]); } }}>{b.emoji || "💡"}</button>
              {editableText(b, "Callout")}
            </div>
          </div>
        );
        if (b.type === "page") {
          const info = pageContext?.resolve(b.pageId);
          const title = info?.title || b.title || "Untitled";
          const icon = info?.icon || b.icon || "📄";
          return (
            <div key={b.id} className={rowCls(" ne-page-row")} {...rowProps}>
              {handle}
              <button className="ne-page-block" data-testid={`pageblock-${b.pageId}`} disabled={!pageContext}
                onClick={() => pageContext?.onOpenPage(b.pageId)} title={`Open ${title}`}>
                <span className="ne-page-ic"><PageIcon icon={icon} size={17} /></span>
                <span className="ne-page-title">{title}</span>
                <PageArrow size={15} className="ne-page-arrow" />
              </button>
            </div>
          );
        }
        // paragraph / heading / quote / list — the shared editable text element
        const marker = (
          <>
            {b.type === "ul" && <span className="ne-marker">{indent % 2 === 1 ? "◦" : "•"}</span>}
            {b.type === "ol" && <span className="ne-marker ne-marker-n">{olNumber(blocks.indexOf(b), indent)}.</span>}
          </>
        );
        return (
          <div key={b.id} className={rowCls(b.type === "ul" || b.type === "ol" ? " ne-list-row" : "")} {...rowProps}>
            {handle}
            {marker}
            {editableText(b)}
          </div>
        );
      })}

      {menu && filtered.length > 0 && (
        <div ref={menuRef} className={`ne-menu${menu.above ? " ne-menu-above" : ""}`} style={{ left: menu.x, top: menu.y }} data-testid="slash-menu">
          <div className="ne-menu-h">Blocks</div>
          {filtered.map((c, i) => (
            <button key={c.key} className={`ne-menu-i${i === menu.sel ? " is-sel" : ""}`} data-testid={`slash-${c.key}`}
              ref={i === menu.sel ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onMouseEnter={() => setMenu({ ...menu, sel: i })}
              onMouseDown={(e) => { e.preventDefault(); applyCommand(menu.blockId, c); }}>
              <span className="ne-menu-ic">{c.icon}</span>
              <span className="ne-menu-tx"><b>{c.label}</b><i>{c.hint}</i></span>
            </button>
          ))}
        </div>
      )}

      {pageMenu && (
        <div ref={pageMenuRef} className={`ne-menu${pageMenu.above ? " ne-menu-above" : ""}`} style={{ left: pageMenu.x, top: pageMenu.y }} data-testid="page-menu">
          <div className="ne-menu-h">Link to page</div>
          {pageResults.map((r, i) => (
            <button key={r.id} className={`ne-menu-i${i === pageMenu.sel ? " is-sel" : ""}`} data-testid={`page-opt-${r.id}`}
              ref={i === pageMenu.sel ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onMouseEnter={() => setPageMenu({ ...pageMenu, sel: i })}
              onMouseDown={(e) => { e.preventDefault(); chooseFromPageMenu(pageMenu.blockId, r); }}>
              <span className="ne-menu-ic">{r.icon || "📄"}</span>
              <span className="ne-menu-tx"><b>{r.title || "Untitled"}</b></span>
            </button>
          ))}
          <button className={`ne-menu-i${pageMenu.sel === pageResults.length ? " is-sel" : ""}`} data-testid="page-opt-new"
            onMouseEnter={() => setPageMenu({ ...pageMenu, sel: pageResults.length })}
            onMouseDown={(e) => { e.preventDefault(); chooseFromPageMenu(pageMenu.blockId, "new"); }}>
            <span className="ne-menu-ic"><Plus size={15} /></span>
            <span className="ne-menu-tx"><b>New page{pageMenu.query ? ` “${pageMenu.query}”` : ""}</b><i>Create + link</i></span>
          </button>
        </div>
      )}

      {toolbar && (
        // mousedown-preventDefault everywhere so the text selection survives the click
        <div className="ne-toolbar nx-pop-in" data-testid="inline-toolbar" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={(e) => e.preventDefault()}>
          <button title="Bold" data-testid="fmt-bold" onMouseDown={(e) => { e.preventDefault(); applyMark("bold", toolbar.blockId); }}><Bold size={14} /></button>
          <button title="Italic" data-testid="fmt-italic" onMouseDown={(e) => { e.preventDefault(); applyMark("italic", toolbar.blockId); }}><Italic size={14} /></button>
          <button title="Underline" data-testid="fmt-underline" onMouseDown={(e) => { e.preventDefault(); applyMark("underline", toolbar.blockId); }}><UnderlineIcon size={14} /></button>
          <button title="Strikethrough" data-testid="fmt-strike" onMouseDown={(e) => { e.preventDefault(); applyMark("strike", toolbar.blockId); }}><Strikethrough size={14} /></button>
          <button title="Inline code" data-testid="fmt-code" onMouseDown={(e) => { e.preventDefault(); applyMark("code", toolbar.blockId); }}><CodeInline size={14} /></button>
          <button title="Link" data-testid="fmt-link" onMouseDown={(e) => { e.preventDefault(); applyMark("link", toolbar.blockId); }}><Link2 size={14} /></button>
          <span className="ne-tb-sep" />
          <button title="Highlight" data-testid="fmt-highlight" className={palette === "hl" ? "is-on" : ""} onMouseDown={(e) => { e.preventDefault(); setPalette(palette === "hl" ? "none" : "hl"); }}><Highlighter size={14} /></button>
          <button title="Text color" data-testid="fmt-color" className={palette === "color" ? "is-on" : ""} onMouseDown={(e) => { e.preventDefault(); setPalette(palette === "color" ? "none" : "color"); }}><Baseline size={14} /></button>
          {palette !== "none" && (
            <div className="ne-swatches" data-testid="fmt-swatches" onMouseDown={(e) => e.preventDefault()}>
              {palette === "hl" && <button className="ne-sw ne-sw-def" title="Default highlight" onMouseDown={(e) => { e.preventDefault(); applyMark("highlight", toolbar.blockId); }} />}
              {OPT_COLORS.map((c) => (
                <button key={c} className={`ne-sw ne-sw-${palette}`} data-c={c} title={c}
                  onMouseDown={(e) => { e.preventDefault(); applyMark(palette === "color" ? "color" : "highlight", toolbar.blockId, c); }}>
                  {palette === "color" ? "A" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) void insertImages(e.target.files, imgTargetRef.current || undefined); imgTargetRef.current = null; e.target.value = ""; }} />
    </div>
  );
}

function BlockHandle({ onAdd, onDel, onGripPointerDown, onMenu, menuOpen, onUp, onDown, onCloseMenu }: {
  onAdd: () => void; onDel: () => void; onGripPointerDown: (e: React.PointerEvent) => void;
  onMenu: () => void; menuOpen: boolean; onUp: () => void; onDown: () => void; onCloseMenu: () => void;
}) {
  return (
    <div className="ne-handle">
      <button className="ne-h-add" title="Insert block below" onMouseDown={(e) => { e.preventDefault(); onAdd(); }}><Plus size={14} /></button>
      {/* one control on touch: TAP opens the actions menu (there is no hover to reveal a
          rail, and a 3-button rail in the flow eats the reading column), DRAG reorders */}
      <button className="ne-h-grip" title="Drag to reorder, tap for actions"
        onPointerDown={onGripPointerDown}
        onClick={(e) => { e.preventDefault(); onMenu(); }}><GripVertical size={14} /></button>
      <button className="ne-h-del" title="Delete block" onMouseDown={(e) => { e.preventDefault(); onDel(); }}><Trash2 size={12.5} /></button>
      {menuOpen && (
        <div className="ne-blockmenu" data-testid="block-actions" onClick={(e) => e.stopPropagation()}>
          <button data-testid="block-insert" onClick={() => { onAdd(); onCloseMenu(); }}><Plus size={15} /> Insert below</button>
          <button data-testid="block-up" onClick={() => { onUp(); onCloseMenu(); }}><ArrowUp size={15} /> Move up</button>
          <button data-testid="block-down" onClick={() => { onDown(); onCloseMenu(); }}><ArrowDown size={15} /> Move down</button>
          <button className="is-danger" data-testid="block-delete" onClick={() => { onDel(); onCloseMenu(); }}><Trash2 size={15} /> Delete</button>
        </div>
      )}
    </div>
  );
}

/* per-option-color rules for inline highlight/text-color marks + the toolbar swatches,
   generated from the token canvas' option colors (both themes flip via the vars). */
const NE_COLOR_CSS = OPT_COLORS.map((c) => `
.ne-hl[data-h="${c}"]{background:color-mix(in oklab,var(--nx-opt-${c}) 26%,transparent)}
.ne-color[data-c="${c}"]{color:var(--nx-opt-${c})}
.ne-sw-hl[data-c="${c}"]{background:color-mix(in oklab,var(--nx-opt-${c}) 36%,transparent)}
.ne-sw-color[data-c="${c}"]{color:var(--nx-opt-${c})}`).join("");

const NE_CSS = `
.ne-root{position:relative;max-width:760px;min-height:56vh;padding-bottom:34vh;font-family:var(--nx-font-sans);cursor:text}
.ne-block strong,.ne-block b{font-weight:680;color:inherit}
.ne-block code{font-family:var(--nx-font-mono);font-size:.86em;background:var(--nx-bg-sunken);border:1px solid var(--nx-border);padding:1px 5px;border-radius:0}
.ne-a{color:var(--nx-accent);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
.ne-a:hover{color:var(--nx-accent-hover)}
.ne-root.is-filedrag{outline:2px dashed var(--nx-accent);outline-offset:10px;border-radius:10px}
.ne-ghost{position:fixed;top:-999px;left:-999px;pointer-events:none;background:var(--nx-accent);color:var(--nx-accent-fg);
  font:600 12.5px/1 var(--nx-font-sans);padding:8px 12px;border-radius:7px;box-shadow:0 8px 24px color-mix(in oklab,var(--nx-accent) 40%,transparent);white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis}
.ne-drop{position:fixed;inset:auto;left:50%;top:90px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:9px;
  background:var(--nx-accent);color:var(--nx-accent-fg);padding:10px 18px;border-radius:var(--nx-radius-m);font-family:var(--nx-font-mono);font-size:12px;letter-spacing:.05em;box-shadow:var(--nx-shadow-2)}
.ne-row{position:relative;display:flex;align-items:flex-start;gap:2px;margin:1px 0;border-radius:5px;
  transition:opacity var(--nx-t-fast) var(--nx-ease),background var(--nx-t-fast) var(--nx-ease)}
.ne-row.ne-list-row{align-items:baseline}
.ne-row:hover{background:color-mix(in oklab,var(--nx-bg-sunken) 55%,transparent)}
.ne-handle{position:absolute;left:-74px;top:1px;display:flex;gap:1px;opacity:0;transition:opacity var(--nx-t-fast)}
.ne-row:hover>.ne-handle{opacity:1}
.ne-handle > button{width:23px;height:24px;display:grid;place-items:center;border:0;background:none;color:var(--nx-fg-faint);cursor:pointer;border-radius:5px;transition:background var(--nx-t-fast),color var(--nx-t-fast)}
.ne-handle > button:hover{background:var(--nx-bg-sunken);color:var(--nx-fg)}
.ne-h-grip{cursor:grab}
.ne-h-grip:active{cursor:grabbing}
.ne-h-del:hover{background:var(--nx-danger-soft)!important;color:var(--nx-danger)!important}
/* drag-to-reorder feedback — light: the row just fades, a crisp accent line marks the slot */
.ne-row.is-dragging{opacity:.35;background:transparent}
.ne-row.drop-before::before,.ne-row.drop-after::after{content:"";position:absolute;left:-2px;right:-2px;height:2.5px;border-radius:3px;
  background:var(--nx-accent);box-shadow:0 0 8px color-mix(in oklab,var(--nx-accent) 50%,transparent);animation:dropLine var(--nx-t-fast) var(--nx-ease)}
.ne-row.drop-before::before{top:-2px}
.ne-row.drop-after::after{bottom:-2px}
@keyframes dropLine{from{opacity:0;transform:scaleX(.7)}to{opacity:1;transform:none}}
/* inline tracked change (suggesting mode) */
.ne-suggesting{cursor:default}
.ne-chg{border-radius:3px;padding:0 1px;transition:background var(--nx-t-med),box-shadow var(--nx-t-med)}
.ne-chg.is-hot{background:color-mix(in oklab,var(--nx-accent) 12%,transparent);box-shadow:0 0 0 2px color-mix(in oklab,var(--nx-accent) 28%,transparent)}
.ne-chg del{color:var(--nx-danger);text-decoration:line-through;text-decoration-color:var(--nx-danger);opacity:.66}
.ne-chg ins{color:var(--nx-accent);text-decoration:underline;text-decoration-color:var(--nx-accent);text-underline-offset:3px;background:var(--nx-accent-soft);margin-left:.14em;border-radius:2px}
.ne-chg.is-pulse{animation:chgPulse .8s ease}
@keyframes chgPulse{0%{background:color-mix(in oklab,var(--nx-accent) 30%,transparent)}100%{background:transparent}}
/* wrap at word boundaries, breaking only a word too long to fit — never mid-word per
   character (word-break:break-word crushed to one letter per line in a narrow column) */
.ne-block{flex:1;min-width:0;outline:none;line-height:1.72;white-space:pre-wrap;word-break:normal;overflow-wrap:break-word;min-height:1.2em;caret-color:var(--nx-accent)}
/* the placeholder ("Type '/' for commands…", "Heading") shows ONLY on the FOCUSED empty
   block — like Notion. Otherwise every empty block stacks the hint and reads as broken. */
.ne-block:empty:focus::before{content:attr(data-ph);color:var(--nx-fg-faint);pointer-events:none}
.ne-root.is-ro .ne-block:empty::before,.ne-root.is-ro .ne-cap:empty::before{content:""}
.ne-p{font-size:18px;color:var(--nx-fg);margin:0}
.ne-h1{font-size:31px;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin:16px 0 2px}
.ne-h2{font-size:24px;font-weight:750;letter-spacing:-.022em;line-height:1.2;margin:14px 0 2px}
.ne-h3{font-size:19.5px;font-weight:700;letter-spacing:-.015em;margin:10px 0 2px}
.ne-quote{font-size:18px;font-style:italic;color:var(--nx-fg-muted);border-left:3px solid var(--nx-accent);padding-left:16px;margin:4px 0}
.ne-ul,.ne-ol{font-size:18px;margin:0}
.ne-marker{flex:none;width:22px;text-align:center;color:var(--nx-fg-muted);font-size:18px;line-height:1.72;user-select:none}
.ne-marker-n{font-family:var(--nx-font-mono);font-size:14px}
.ne-divider-row{margin:14px 0}
.ne-divider{flex:1;border:0;border-top:1px solid var(--nx-border);margin:10px 0}
.ne-image{flex:1;position:relative;margin:8px 0}
.ne-image img{max-width:100%;border-radius:8px;display:block;border:1px solid var(--nx-border)}
.ne-img-x{position:absolute;top:8px;right:8px;background:rgba(11,11,11,.72);color:#fff;border:0;width:26px;height:26px;border-radius:6px;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .14s}
.ne-image:hover .ne-img-x{opacity:1}
.ne-cap{outline:none;text-align:center;font-size:13px;color:var(--nx-fg-muted);font-family:var(--nx-font-mono);margin-top:8px;min-height:1.2em}
.ne-cap:empty::before{content:attr(data-ph);color:var(--nx-fg-faint)}
.ne-table-wrap{flex:1;margin:8px 0}
.ne-table{border-collapse:collapse;width:100%;font-size:15px}
.ne-table td{border:1px solid var(--nx-border);padding:0;vertical-align:top}
.ne-cell{outline:none;padding:8px 11px;min-height:1.4em;min-width:60px}
.ne-cell:focus{box-shadow:inset 0 0 0 2px var(--nx-accent)}
.ne-cell-h{font-weight:700;background:var(--nx-bg-sunken)}
.ne-cell:empty::before{content:attr(data-ph);color:var(--nx-fg-faint)}
.ne-table-ctl{display:flex;gap:6px;margin-top:6px;opacity:0;transition:opacity var(--nx-t-fast)}
.ne-table-row:hover .ne-table-ctl{opacity:1}
.ne-table-ctl button{display:inline-flex;align-items:center;gap:4px;font-family:var(--nx-font-mono);font-size:10px;letter-spacing:.05em;text-transform:uppercase;
  border:1px solid var(--nx-border);background:var(--nx-bg);color:var(--nx-fg-muted);padding:4px 9px;border-radius:5px;cursor:pointer;transition:border-color var(--nx-t-fast) var(--nx-ease),color var(--nx-t-fast) var(--nx-ease)}
.ne-table-ctl button:hover{border-color:var(--nx-accent);color:var(--nx-accent)}
.ne-menu{position:fixed;z-index:50;width:250px;max-height:320px;overflow-y:auto;background:var(--nx-bg);border:1px solid var(--nx-border);
  border-radius:10px;box-shadow:0 12px 40px rgba(11,11,11,.16);padding:6px;animation:neMenuIn var(--nx-t-fast) var(--nx-ease-settle)}
@keyframes neMenuIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.ne-menu-h{font-family:var(--nx-font-mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--nx-fg-faint);padding:6px 10px 4px}
.ne-menu-i{display:flex;align-items:center;gap:11px;width:100%;border:0;background:none;padding:8px 10px;border-radius:7px;cursor:pointer;text-align:left;transition:background var(--nx-t-fast) var(--nx-ease)}
.ne-menu-i.is-sel{background:var(--nx-accent-soft)}
.ne-menu-ic{display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--nx-border);border-radius:6px;color:var(--nx-fg);flex:none;background:var(--nx-bg)}
.ne-menu-tx{display:flex;flex-direction:column;line-height:1.35}
.ne-menu-tx b{font-size:13.5px;font-weight:600;color:var(--nx-fg)}
.ne-menu-tx i{font-style:normal;font-size:11.5px;color:var(--nx-fg-muted)}
.ne-menu-above{transform:translateY(-100%);animation:neMenuInUp var(--nx-t-fast) var(--nx-ease-settle)}
@keyframes neMenuInUp{from{opacity:0;transform:translateY(calc(-100% + 6px))}to{opacity:1;transform:translateY(-100%)}}
@media(prefers-reduced-motion:reduce){.ne-menu,.ne-menu-above{animation:none}}

/* ==== added inline marks: italic / underline / strike / highlight ==== */
.ne-block em,.ne-block i{font-style:italic}
.ne-block u{text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
.ne-block del,.ne-block s,.ne-block strike{text-decoration:line-through;color:var(--nx-fg-muted)}
.ne-block mark,.ne-block .ne-hl{background:color-mix(in oklab,var(--nx-accent) 22%,transparent);color:inherit;border-radius:2px;padding:0 1px}
.ne-h-grip{touch-action:none}
/* ==== to-do ==== */
.ne-todo-row{align-items:flex-start}
.ne-check{flex:none;width:19px;height:19px;margin-top:4px;border:1.6px solid var(--nx-border-strong);border-radius:5px;background:var(--nx-bg);display:grid;place-items:center;cursor:pointer;color:var(--nx-accent-fg);transition:background var(--nx-t-fast) var(--nx-ease),border-color var(--nx-t-fast) var(--nx-ease)}
.ne-check:hover{border-color:var(--nx-accent)}
.ne-check.is-checked{background:var(--nx-accent);border-color:var(--nx-accent)}
.ne-block.ne-todo{font-size:18px}
.ne-block.ne-todo.is-done{color:var(--nx-fg-faint);text-decoration:line-through;text-decoration-color:var(--nx-fg-faint)}
/* ==== toggle ==== */
.ne-toggle-row{align-items:flex-start}
.ne-tw{flex:none;width:22px;height:29px;display:grid;place-items:center;border:0;background:none;color:var(--nx-fg-muted);cursor:pointer;border-radius:5px;transition:background var(--nx-t-fast) var(--nx-ease),color var(--nx-t-fast) var(--nx-ease)}
.ne-tw:hover{background:var(--nx-bg-sunken);color:var(--nx-fg)}
.ne-tw svg{transition:transform var(--nx-t-fast) var(--nx-ease)}
.ne-tw.is-open svg{transform:rotate(90deg)}
.ne-block.ne-toggle{font-size:18px;font-weight:600}
/* ==== callout ==== */
.ne-callout-box{flex:1;display:flex;gap:11px;align-items:flex-start;padding:12px 15px;margin:5px 0;border-radius:var(--nx-radius-m);background:var(--nx-accent-soft);border:1px solid color-mix(in oklab,var(--nx-accent) 22%,transparent)}
.ne-callout-emoji{flex:none;font-size:18px;line-height:1.5;border:0;background:none;cursor:pointer;padding:0 2px;border-radius:5px;transition:background var(--nx-t-fast)}
.ne-callout-emoji:hover{background:color-mix(in oklab,var(--nx-accent) 14%,transparent)}
.ne-callout-box .ne-block.ne-callout{flex:1;font-size:16px}
.ne-tone-ok{background:var(--nx-ok-soft);border-color:color-mix(in oklab,var(--nx-ok) 30%,transparent)}
.ne-tone-warn{background:var(--nx-warn-soft);border-color:color-mix(in oklab,var(--nx-warn) 30%,transparent)}
.ne-tone-danger{background:var(--nx-danger-soft);border-color:color-mix(in oklab,var(--nx-danger) 30%,transparent)}
/* ==== code block ==== */
.ne-code{flex:1;margin:8px 0;border:1px solid var(--nx-border);border-radius:var(--nx-radius-m);overflow:hidden;background:var(--nx-bg-sunken)}
.ne-code-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 7px 5px 9px;border-bottom:1px solid var(--nx-border);background:var(--nx-bg)}
.ne-code-lang{font-family:var(--nx-font-mono);font-size:11px;color:var(--nx-fg-muted);background:var(--nx-bg);border:1px solid var(--nx-border);border-radius:5px;padding:2px 6px;cursor:pointer}
.ne-code-copy{flex:none;display:grid;place-items:center;width:24px;height:22px;border:0;background:none;color:var(--nx-fg-faint);cursor:pointer;border-radius:5px;transition:background var(--nx-t-fast),color var(--nx-t-fast)}
.ne-code-copy:hover{background:var(--nx-bg-sunken);color:var(--nx-fg)}
.ne-code-body{margin:0;padding:12px 15px;font-family:var(--nx-font-mono);font-size:13px;line-height:1.62;white-space:pre;overflow-x:auto;outline:none;color:var(--nx-fg);tab-size:2;-moz-tab-size:2}
.ne-code-body:empty::before{content:"Write code…";color:var(--nx-fg-faint)}
.ne-t-c{color:var(--nx-fg-faint);font-style:italic}
.ne-t-s{color:var(--nx-opt-green)}
.ne-t-n{color:var(--nx-opt-orange)}
.ne-t-k{color:var(--nx-opt-purple);font-weight:600}
/* ==== inline formatting toolbar ==== */
.ne-toolbar{position:fixed;z-index:60;transform:translate(-50%,calc(-100% - 8px));display:flex;align-items:center;gap:1px;padding:4px;background:var(--nx-bg-raised);border:1px solid var(--nx-border);border-radius:10px;box-shadow:var(--nx-shadow-2)}
.ne-toolbar button{display:grid;place-items:center;min-width:29px;height:29px;border:0;background:none;color:var(--nx-fg-muted);cursor:pointer;border-radius:7px;transition:background var(--nx-t-fast) var(--nx-ease),color var(--nx-t-fast) var(--nx-ease)}
.ne-toolbar button:hover{background:var(--nx-bg-sunken);color:var(--nx-fg)}
.ne-toolbar button.is-on{background:var(--nx-accent-soft);color:var(--nx-accent)}
.ne-tb-sep{width:1px;height:18px;background:var(--nx-border);margin:0 4px}
.ne-swatches{display:flex;gap:3px;align-items:center;padding-left:5px;margin-left:3px;border-left:1px solid var(--nx-border)}
.ne-sw{width:22px;height:22px;border:1px solid var(--nx-border);border-radius:5px;cursor:pointer;font:800 12px var(--nx-font-sans);display:grid;place-items:center;background:var(--nx-bg);color:var(--nx-fg)}
.ne-sw:hover{border-color:var(--nx-accent)}
.ne-sw-def{background:color-mix(in oklab,var(--nx-accent) 24%,transparent)}
/* block actions menu (the touch equivalent of the hover rail) */
.ne-blockmenu{position:absolute;left:0;top:30px;z-index:70;min-width:186px;padding:5px;background:var(--nx-bg-raised);border:1px solid var(--nx-border);border-radius:var(--nx-radius-m);box-shadow:var(--nx-shadow-2);animation:nxPopIn var(--nx-t-fast) var(--nx-ease-settle)}
.ne-blockmenu button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:var(--nx-fg);font:var(--nx-text-body);text-align:left;white-space:nowrap;padding:10px 10px;border-radius:var(--nx-radius-s);cursor:pointer}
.ne-blockmenu button:hover{background:var(--nx-bg-sunken)}
.ne-blockmenu button svg{flex:none;width:15px;height:15px;color:var(--nx-fg-muted)}
.ne-blockmenu button.is-danger,.ne-blockmenu button.is-danger svg{color:var(--nx-danger)}
/* ==== touch — one in-flow control, bigger tap targets, wrapping toolbar ==== */
@media (pointer:coarse) and (max-width:820px){
  .ne-root{max-width:100%}
  /* the rail collapses to the grip: TAP for the actions menu, DRAG to reorder. Insert and
     delete live in that menu, so the flow keeps its reading width. */
  .ne-handle{position:static;opacity:1;margin-right:4px}
  .ne-handle .ne-h-add,.ne-handle .ne-h-del{display:none}
  .ne-row{align-items:center}
  .ne-handle > button{width:34px;height:34px}
  .ne-blockmenu button{padding:12px 12px}
  /* comfortable touch typing: no iOS zoom-on-focus (needs >=16px), roomier lines */
  .ne-block,.ne-cell,.ne-cap{font-size:16.5px;line-height:1.65}
  .ne-row{padding-block:2px}
  .ne-toolbar{max-width:96vw;flex-wrap:wrap;justify-content:center;padding:6px}
  .ne-toolbar button{min-width:38px;height:38px}
  .ne-sw{width:30px;height:30px}
  .ne-swatches{flex-wrap:wrap;max-width:100%}
  /* the slash menu becomes a bottom sheet so it can never be clipped by the caret position */
  .ne-menu{position:fixed !important;left:8px !important;right:8px !important;top:auto !important;bottom:8px !important;max-height:52vh;width:auto !important;max-width:none}
  .ne-menu-i,.ne-menu button{padding:12px 12px}
}
@media (max-width:640px){
  .ne-toolbar{max-width:94vw;flex-wrap:wrap;justify-content:center}
  .ne-swatches{flex-wrap:wrap;max-width:100%}
}
/* ==== sub-page block + inline page link ==== */
.ne-page-block{flex:1;display:flex;align-items:center;gap:9px;width:100%;border:0;background:none;cursor:pointer;padding:6px 8px;margin:1px 0;border-radius:var(--nx-radius-s);color:var(--nx-fg);font-family:var(--nx-font-sans);font-size:17px;text-align:left;transition:background var(--nx-t-fast) var(--nx-ease)}
.ne-page-block:hover{background:var(--nx-bg-sunken)}
.ne-page-block:disabled{cursor:default}
.ne-page-ic{flex:none;font-size:18px;line-height:1}
.ne-page-title{flex:1;font-weight:500;border-bottom:1px solid var(--nx-border);padding-bottom:1px}
.ne-page-block:hover .ne-page-title{border-bottom-color:var(--nx-border-strong)}
.ne-page-arrow{flex:none;color:var(--nx-fg-faint);opacity:0;transition:opacity var(--nx-t-fast)}
.ne-page-block:hover .ne-page-arrow{opacity:1}
.ne-pagelink{color:var(--nx-accent);font-weight:500;cursor:pointer;border-radius:3px;padding:0 3px 0 1px;text-decoration:underline;text-decoration-color:color-mix(in oklab,var(--nx-accent) 40%,transparent);text-underline-offset:2px;white-space:nowrap}
.ne-pagelink::before{content:"📄";font-size:.82em;margin-right:2px}
.ne-pagelink:hover{background:var(--nx-accent-soft)}
` + NE_COLOR_CSS;
