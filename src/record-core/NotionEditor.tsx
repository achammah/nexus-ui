import * as React from "react";
import { GripVertical, Plus, Trash2, ImagePlus, Table as TableIcon, Type, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus, X } from "lucide-react";

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

export type Block =
  | { id: string; type: "p" | "h1" | "h2" | "h3" | "quote" | "ul" | "ol"; text: string }
  | { id: string; type: "divider" }
  | { id: string; type: "image"; src: string; caption?: string }
  | { id: string; type: "table"; rows: string[][] };

let _seq = 0;
export const bid = () => `b${Date.now().toString(36)}${(_seq++).toString(36)}`;

const TEXTLIKE = new Set(["p", "h1", "h2", "h3", "quote", "ul", "ol"]);

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

export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "divider") parts.push("---");
    else if (b.type === "image") parts.push(`![${b.caption || ""}](${b.src.slice(0, 60)}${b.src.length > 60 ? "…" : ""})`);
    else if (b.type === "table") parts.push(b.rows.map((r) => `| ${r.join(" | ")} |`).join("\n").replace(/^(.*)\n/, (m, h) => `${h}\n| ${b.rows[0].map(() => "---").join(" | ")} |\n`));
    else if (b.type === "h1") parts.push(`# ${b.text}`);
    else if (b.type === "h2") parts.push(`## ${b.text}`);
    else if (b.type === "h3") parts.push(`### ${b.text}`);
    else if (b.type === "quote") parts.push(`> ${b.text}`);
    else if (b.type === "ul") parts.push(`- ${b.text}`);
    else if (b.type === "ol") parts.push(`1. ${b.text}`);
    else parts.push(b.text);
  }
  return parts.join("\n\n");
}

interface Cmd { key: Block["type"]; label: string; hint: string; icon: React.ReactNode; kw: string; }
const COMMANDS: Cmd[] = [
  { key: "p", label: "Text", hint: "Plain paragraph", icon: <Type size={15} />, kw: "text paragraph body p" },
  { key: "h1", label: "Heading 1", hint: "Big section title", icon: <Heading1 size={15} />, kw: "h1 heading title big" },
  { key: "h2", label: "Heading 2", hint: "Medium heading", icon: <Heading2 size={15} />, kw: "h2 heading subtitle" },
  { key: "h3", label: "Heading 3", hint: "Small heading", icon: <Heading3 size={15} />, kw: "h3 heading" },
  { key: "ul", label: "Bulleted list", hint: "• item", icon: <List size={15} />, kw: "bullet list unordered ul" },
  { key: "ol", label: "Numbered list", hint: "1. item", icon: <ListOrdered size={15} />, kw: "number ordered list ol" },
  { key: "quote", label: "Quote", hint: "Callout quote", icon: <Quote size={15} />, kw: "quote callout blockquote" },
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
export interface InlineChange { id: string; original: string; replacement: string; status: "pending" | "accepted" | "rejected"; kind?: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* build a block's inner HTML with tracked-change widgets: each change is an ATOMIC
   contenteditable=false span (del + ins) embedded in otherwise-editable text, so the
   author can keep typing around it while the suggestion stays visible (Google-Docs style). */
/* inline markdown → HTML, applied to ALREADY-ESCAPED text so generated copy renders
   formatted (bold, links, inline code) instead of showing raw **…** / [..](..). The
   round-trip back to markdown lives in serializeBlock, so edits + saves stay markdown. */
function inlineMd(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" class="ne-a" data-md="link" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong data-md="b">$1</strong>')
    .replace(/`([^`]+)`/g, '<code data-md="c">$1</code>');
}

function buildBlockHtml(text: string, chs: InlineChange[]): string {
  if (!chs.length) return inlineMd(esc(text));
  const found = chs.map((c) => ({ c, i: text.indexOf(c.original) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  let pos = 0, html = "";
  for (const { c, i } of found) {
    if (i < pos) continue; // overlapping match — skip
    html += inlineMd(esc(text.slice(pos, i)));
    html += `<span class="ne-chg" data-cid="${c.id}" contenteditable="false"><del>${esc(c.original)}</del><ins>${esc(c.replacement)}</ins></span>`;
    pos = i + c.original.length;
  }
  html += inlineMd(esc(text.slice(pos)));
  return html;
}

/* read the plain text back out of a (possibly decorated) editable block: change
   widgets contribute their ORIGINAL text, so the model stays anchored until resolved. */
function serializeBlock(el: HTMLElement, chs: InlineChange[]): string {
  let out = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent || "";
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as HTMLElement;
      const cid = e.getAttribute("data-cid");
      if (cid) { const ch = chs.find((c) => c.id === cid); out += ch ? ch.original : (e.querySelector("del")?.textContent || e.textContent || ""); }
      else if (e.tagName === "BR") out += "";
      // inline-markdown widgets round-trip back to their markdown source
      else if (e.tagName === "STRONG" || e.tagName === "B") out += `**${e.textContent || ""}**`;
      else if (e.tagName === "CODE") out += "`" + (e.textContent || "") + "`";
      else if (e.tagName === "A") { const href = e.getAttribute("href") || ""; out += `[${e.textContent || ""}](${href})`; }
      else out += e.textContent || "";
    }
  });
  return out.replace(/ /g, " ");
}

export function NotionEditor({ blocks, onChange, readOnly, changes, hoveredChange, onHoverChange }: {
  blocks: Block[]; onChange: (b: Block[]) => void; readOnly?: boolean;
  changes?: InlineChange[]; hoveredChange?: string | null; onHoverChange?: (id: string | null) => void;
}) {
  const [drag, setDrag] = React.useState<{ id: string; overId: string | null; pos: "before" | "after" } | null>(null);
  const [grabId, setGrabId] = React.useState<string | null>(null);
  const pendingChanges = React.useMemo(() => (changes || []).filter((c) => c.status === "pending"), [changes]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // content is set imperatively (contenteditable), so sync the card→inline highlight via the DOM
  React.useEffect(() => {
    const root = rootRef.current; if (!root) return;
    root.querySelectorAll(".ne-chg.is-hot").forEach((e) => e.classList.remove("is-hot"));
    if (hoveredChange) root.querySelector(`.ne-chg[data-cid="${hoveredChange}"]`)?.classList.add("is-hot");
  }, [hoveredChange, blocks, changes]);
  const [menu, setMenu] = React.useState<{ blockId: string; query: string; sel: number; x: number; y: number; above: boolean } | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
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
  const [dragOver, setDragOver] = React.useState(false);
  const elRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const imgTargetRef = React.useRef<string | null>(null); // block id whose "/image" opened the picker

  const filtered = menu ? COMMANDS.filter((c) => { const q = menu.query.trim().toLowerCase(); return !q || c.kw.includes(q) || c.label.toLowerCase().includes(q); }) : [];

  const update = (next: Block[]) => onChange(next);
  const patchBlock = (blockId: string, patch: Partial<Block>) =>
    update(blocks.map((b) => (b.id === blockId ? { ...b, ...patch } as Block : b)));

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
    // text-like transform: strip the "/query" token the menu was triggered by, keep the rest
    const cur = blocks[idx];
    const keepText = cur.type === "divider" || cur.type === "image" || cur.type === "table" ? "" : (cur as { text: string }).text.replace(/(^|\s)\/[^\s/]*$/, "$1");
    if (elRefs.current[blockId]) elRefs.current[blockId]!.textContent = keepText;
    patchBlock(blockId, { type: cmd.key, text: keepText } as Partial<Block>);
    focusBlock(blockId);
  }

  function onTextInput(b: Block, el: HTMLElement) {
    const text = serializeBlock(el, pendingChanges);
    patchBlock(b.id, { text } as Partial<Block>);
    if (readOnly) return;
    // "/" opens the menu at the start of a line or right after a space (Notion-style)
    const before = caretText(el).before;
    const m = before.match(/(?:^|\s)\/([^\s/]*)$/);
    if (m) openMenuFor(b.id, m[1]);
    else if (menu?.blockId === b.id) setMenu(null);
  }

  function onTextKeyDown(e: React.KeyboardEvent, b: Block) {
    const el = e.currentTarget as HTMLElement;
    if (menu && menu.blockId === b.id) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenu({ ...menu, sel: Math.min(menu.sel + 1, filtered.length - 1) }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenu({ ...menu, sel: Math.max(menu.sel - 1, 0) }); return; }
      if (e.key === "Enter") { e.preventDefault(); if (filtered[menu.sel]) applyCommand(b.id, filtered[menu.sel]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMenu(null); return; }
    }
    const idx = blocks.findIndex((x) => x.id === b.id);
    const hasChanges = changesFor(b).length > 0;
    if (e.key === "Enter" && !e.shiftKey && hasChanges) {
      // don't split a block that carries tracked-change widgets — just open a fresh line
      e.preventDefault(); addBlockAfter(b.id); return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const { before, after } = caretText(el);
      // list blocks: Enter on an empty item exits the list to a paragraph
      if ((b.type === "ul" || b.type === "ol") && before === "" && after === "") {
        patchBlock(b.id, { type: "p" } as Partial<Block>); if (elRefs.current[b.id]) elRefs.current[b.id]!.textContent = ""; return;
      }
      el.textContent = before;
      const contType: Block["type"] = b.type === "ul" || b.type === "ol" ? b.type : "p";
      const nb: Block = { id: bid(), type: contType, text: after } as Block;
      const next = [...blocks]; next[idx] = { ...b, text: before } as Block; next.splice(idx + 1, 0, nb); update(next);
      focusBlock(nb.id, false); return;
    }
    if (e.key === "Backspace" && caretAtStart(el)) {
      const prev = blocks[idx - 1];
      if (idx === 0) return;
      if (prev && (prev.type === "divider" || prev.type === "image" || prev.type === "table")) {
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
  function removeBlock(blockId: string) { update(blocks.filter((b) => b.id !== blockId)); }

  /* pending changes whose original text lives in THIS block (drives inline tracked changes) */
  function changesFor(b: Block): InlineChange[] {
    if (b.type === "divider" || b.type === "image" || b.type === "table") return [];
    const t = (b as Extract<Block, { text: string }>).text;
    return pendingChanges.filter((c) => t.includes(c.original));
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
    if (!drag || !drag.overId || drag.id === drag.overId) { setDrag(null); return; }
    const from = blocks.findIndex((b) => b.id === drag.id);
    const moved = blocks[from];
    if (!moved) { setDrag(null); return; }
    const without = blocks.filter((b) => b.id !== drag.id);
    let to = without.findIndex((b) => b.id === drag.overId);
    if (drag.pos === "after") to += 1;
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

  const TAG: Record<string, keyof React.JSX.IntrinsicElements> = { h1: "h1", h2: "h2", h3: "h3", quote: "blockquote", p: "p", ul: "div", ol: "div" };

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
      onDragOver={(e) => { if (readOnly || !isFileDrag(e)) return; e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { if (readOnly || !isFileDrag(e)) return; e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void insertImages(e.dataTransfer.files, blockIdAtY(e.clientY)); }}
    >
      <style>{NE_CSS}</style>
      {dragOver && <div className="ne-drop"><ImagePlus size={18} /> Drop image</div>}

      {blocks.map((b) => {
        const rowCls = (extra = "") => `ne-row${extra}${drag?.id === b.id ? " is-dragging" : ""}` +
          (drag && drag.overId === b.id ? (drag.pos === "before" ? " drop-before" : " drop-after") : "");
        const rowProps = {
          "data-testid": `block-${b.id}`,
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
        const handle = !readOnly && <BlockHandle onAdd={() => addBlockAfter(b.id)} onDel={() => removeBlock(b.id)} onGrab={() => setGrabId(b.id)} />;

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
        // text-like block — always editable; tracked-change widgets are embedded inline
        const Tag = TAG[b.type] as keyof React.JSX.IntrinsicElements;
        const mine = changesFor(b);
        const cls = `ne-block ne-${b.type}${mine.length ? " ne-has-chg" : ""}`;
        const bText = (b as Extract<Block, { text: string }>).text;
        const marker = (
          <>
            {b.type === "ul" && <span className="ne-marker">•</span>}
            {b.type === "ol" && <span className="ne-marker ne-marker-n">{blocks.filter((x, i) => x.type === "ol" && i <= blocks.indexOf(b)).length}.</span>}
          </>
        );
        return (
          <div key={b.id} className={rowCls(b.type === "ul" || b.type === "ol" ? " ne-list-row" : "")} {...rowProps}>
            {handle}
            {marker}
            {React.createElement(Tag as string, {
              className: cls,
              contentEditable: !readOnly,
              suppressContentEditableWarning: true,
              "data-testid": `edit-${b.id}`,
              "data-ph": b.type === "h1" ? "Heading" : b.type === "p" ? "Type '/' for commands…" : "",
              ref: (el: HTMLElement | null): void => {
                elRefs.current[b.id] = el;
                if (!el || document.activeElement === el) return;
                const html = buildBlockHtml(bText, mine);
                if (el.innerHTML !== html) el.innerHTML = html;
              },
              onInput: (e: React.FormEvent<HTMLElement>) => onTextInput(b, e.currentTarget),
              onKeyDown: (e: React.KeyboardEvent) => onTextKeyDown(e, b),
              onMouseOver: mine.length ? (e: React.MouseEvent) => { const s = (e.target as HTMLElement).closest?.("[data-cid]"); onHoverChange?.(s ? s.getAttribute("data-cid") : null); } : undefined,
              onMouseLeave: mine.length ? () => onHoverChange?.(null) : undefined,
            })}
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

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) void insertImages(e.target.files, imgTargetRef.current || undefined); imgTargetRef.current = null; e.target.value = ""; }} />
    </div>
  );
}

function BlockHandle({ onAdd, onDel, onGrab }: { onAdd: () => void; onDel: () => void; onGrab: () => void }) {
  return (
    <div className="ne-handle">
      <button className="ne-h-add" title="Add block below" onMouseDown={(e) => { e.preventDefault(); onAdd(); }}><Plus size={14} /></button>
      <button className="ne-h-grip" title="Drag to reorder" onMouseDown={onGrab}><GripVertical size={14} /></button>
      <button className="ne-h-del" title="Delete block" onMouseDown={(e) => { e.preventDefault(); onDel(); }}><Trash2 size={12.5} /></button>
    </div>
  );
}

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
  transition:opacity .16s ease,background .16s ease}
.ne-row.ne-list-row{align-items:baseline}
.ne-row:hover{background:color-mix(in oklab,var(--nx-bg-sunken) 55%,transparent)}
.ne-handle{position:absolute;left:-74px;top:1px;display:flex;gap:1px;opacity:0;transition:opacity .13s}
.ne-row:hover>.ne-handle{opacity:1}
.ne-handle button{width:23px;height:24px;display:grid;place-items:center;border:0;background:none;color:var(--nx-fg-faint);cursor:pointer;border-radius:5px;transition:background .13s,color .13s}
.ne-handle button:hover{background:var(--nx-bg-sunken);color:var(--nx-fg)}
.ne-h-grip{cursor:grab}
.ne-h-grip:active{cursor:grabbing}
.ne-h-del:hover{background:var(--nx-danger-soft)!important;color:var(--nx-danger)!important}
/* drag-to-reorder feedback — light: the row just fades, a crisp accent line marks the slot */
.ne-row.is-dragging{opacity:.35;background:transparent}
.ne-row.drop-before::before,.ne-row.drop-after::after{content:"";position:absolute;left:-2px;right:-2px;height:2.5px;border-radius:3px;
  background:var(--nx-accent);box-shadow:0 0 8px color-mix(in oklab,var(--nx-accent) 50%,transparent);animation:dropLine .14s ease}
.ne-row.drop-before::before{top:-2px}
.ne-row.drop-after::after{bottom:-2px}
@keyframes dropLine{from{opacity:0;transform:scaleX(.7)}to{opacity:1;transform:none}}
/* inline tracked change (suggesting mode) */
.ne-suggesting{cursor:default}
.ne-chg{border-radius:3px;padding:0 1px;transition:background .18s,box-shadow .18s}
.ne-chg.is-hot{background:color-mix(in oklab,var(--nx-accent) 12%,transparent);box-shadow:0 0 0 2px color-mix(in oklab,var(--nx-accent) 28%,transparent)}
.ne-chg del{color:var(--nx-danger);text-decoration:line-through;text-decoration-color:var(--nx-danger);opacity:.66}
.ne-chg ins{color:var(--nx-accent);text-decoration:underline;text-decoration-color:var(--nx-accent);text-underline-offset:3px;background:var(--nx-accent-soft);margin-left:.14em;border-radius:2px}
.ne-chg.is-pulse{animation:chgPulse .8s ease}
@keyframes chgPulse{0%{background:color-mix(in oklab,var(--nx-accent) 30%,transparent)}100%{background:transparent}}
.ne-block{flex:1;outline:none;line-height:1.72;white-space:pre-wrap;word-break:break-word;min-height:1.2em;caret-color:var(--nx-accent)}
.ne-block:empty::before{content:attr(data-ph);color:var(--nx-fg-faint);pointer-events:none}
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
.ne-table-ctl{display:flex;gap:6px;margin-top:6px;opacity:0;transition:opacity .14s}
.ne-table-row:hover .ne-table-ctl{opacity:1}
.ne-table-ctl button{display:inline-flex;align-items:center;gap:4px;font-family:var(--nx-font-mono);font-size:10px;letter-spacing:.05em;text-transform:uppercase;
  border:1px solid var(--nx-border);background:var(--nx-bg);color:var(--nx-fg-muted);padding:4px 9px;border-radius:5px;cursor:pointer}
.ne-table-ctl button:hover{border-color:var(--nx-accent);color:var(--nx-accent)}
.ne-menu{position:fixed;z-index:50;width:250px;max-height:320px;overflow-y:auto;background:var(--nx-bg);border:1px solid var(--nx-border);
  border-radius:10px;box-shadow:0 12px 40px rgba(11,11,11,.16);padding:6px;animation:neMenuIn .13s cubic-bezier(.16,1,.3,1)}
@keyframes neMenuIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.ne-menu-h{font-family:var(--nx-font-mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--nx-fg-faint);padding:6px 10px 4px}
.ne-menu-i{display:flex;align-items:center;gap:11px;width:100%;border:0;background:none;padding:8px 10px;border-radius:7px;cursor:pointer;text-align:left}
.ne-menu-i.is-sel{background:var(--nx-accent-soft)}
.ne-menu-ic{display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--nx-border);border-radius:6px;color:var(--nx-fg);flex:none;background:var(--nx-bg)}
.ne-menu-tx{display:flex;flex-direction:column;line-height:1.35}
.ne-menu-tx b{font-size:13.5px;font-weight:600;color:var(--nx-fg)}
.ne-menu-tx i{font-style:normal;font-size:11.5px;color:var(--nx-fg-muted)}
.ne-menu-above{transform:translateY(-100%);animation:neMenuInUp .13s cubic-bezier(.16,1,.3,1)}
@keyframes neMenuInUp{from{opacity:0;transform:translateY(calc(-100% + 6px))}to{opacity:1;transform:translateY(-100%)}}
@media(prefers-reduced-motion:reduce){.ne-menu,.ne-menu-above{animation:none}}
`;
