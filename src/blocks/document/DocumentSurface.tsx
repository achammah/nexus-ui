import * as React from "react";
import { NotionEditor, type Block, type EditorConfig, type PageContext } from "../../record-core/NotionEditor";
import { useSuggestions, type Suggestion } from "../../record-core/useSuggestions";
import { SuggestionPanel } from "../../record-core/SuggestionPanel";
import { DocumentOutline } from "../../record-core/DocumentOutline";
import { exportMarkdown, exportHtml, exportPdf, exportDocx, importFile, IMPORT_ACCEPT } from "../../record-core/editor-io";
import { seedDocument, coverBackground, isPresetCover, type DocumentSnapshot } from "./snapshot";
import { PageIcon } from "../../record-core/PageIcon";
import { IconPicker } from "./IconPicker";
import { CoverPicker } from "./CoverPicker";
import { PanelRight, Search, Download, Upload, FileText, FileCode, FileType, Image as ImageIcon, ChevronDown, X, Maximize2, Minimize2, Replace, ListTree, Check, PenLine, MessageSquareText } from "lucide-react";
import "./document.css";

/* DocumentSurface — a Notion×Google-Docs document as a standalone surface. Free-surface:
   the host owns the snapshot (load/persist through its store), this owns editing + chrome
   (cover, icon, title, word count, page width, find & replace, import/export) + the live
   outline rail. Mirrors WorkbookSurface's contract (value / onChange / reloadNonce /
   className / actions). Config-composable: every affordance is a DocumentConfig flag. */

export interface DocumentConfig {
  editor?: EditorConfig;        // block set, inline toolbar, markdown shortcuts, slash menu
  outline?: boolean;            // the live outline rail (default true)
  importExport?: boolean;       // the import/export menu (default true)
  chrome?: boolean;             // cover + icon + title header (default true)
  cover?: boolean;              // allow a cover (default true)
  icon?: boolean;              // allow a page icon/emoji (default true)
  wordCount?: boolean;          // the word/char readout (default true)
  findReplace?: boolean;        // the find & replace bar (default true)
  pageWidthToggle?: boolean;    // narrow/wide toggle (default true)
  suggestions?: boolean;        // the Editing↔Suggesting mode toggle + review panel (default true)
}

export interface DocumentSurfaceProps {
  value: DocumentSnapshot | null;
  onChange?: (snapshot: DocumentSnapshot) => void;
  reloadNonce?: number;
  className?: string;
  actions?: React.ReactNode;
  config?: DocumentConfig;
  readOnly?: boolean;
  /* the reviewer whose edits are attributed when Suggesting mode is on (Word × Google-Docs) */
  author?: { name: string; color?: string };
  /* the page-workspace seam — forwarded to the editor so sub-page blocks + [[page:]] links
     resolve/open/create (PageWorkspace passes this; a standalone document omits it) */
  pageContext?: PageContext;
  /* rendered inside the page column AFTER the editor — PageWorkspace puts the backlinks
     ("linked references") panel here */
  footer?: React.ReactNode;
  /* a header slot ABOVE the toolbar — PageWorkspace puts breadcrumbs + Cmd-K here */
  topBar?: React.ReactNode;
  "data-testid"?: string;
}

/* Touch layout: a coarse pointer on a narrow screen. Both conditions matter — a narrow
   desktop window is still a mouse (popovers are right there), and a large tablet has room
   for the popover form. Drives sheet-vs-popover and the touch affordances. */
export function useTouchLayout(): boolean {
  const q = "(pointer: coarse) and (max-width: 820px)";
  const [on, setOn] = React.useState(() => (typeof window === "undefined" ? false : window.matchMedia(q).matches));
  React.useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setOn(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return on;
}

const stripMarks = (t: string) =>
  t.replace(/\[\[[ch]:[a-z]+\|([^\]]*)\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|~~|\+\+|==|`|\*|_|^#{1,3}\s)/gm, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* minimal single-region diff between two versions of a block's text: strip the common
   prefix + suffix, leaving the changed middle on each side (original → replacement). An
   insertion has empty original, a deletion has empty replacement. One region per call —
   enough for the contiguous edit a keystroke makes; multi-region edits collapse into the
   spanning region, which is honest (the whole touched span becomes one tracked change). */
function diffRegion(oldText: string, newText: string): { original: string; replacement: string; at: number } | null {
  if (oldText === newText) return null;
  let p = 0;
  const max = Math.min(oldText.length, newText.length);
  while (p < max && oldText[p] === newText[p]) p++;
  let s = 0;
  while (s < max - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  return { original: oldText.slice(p, oldText.length - s), replacement: newText.slice(p, newText.length - s), at: p };
}

/* Render pending tracked changes into the block text as visible marks, so an EXPORT is honest
   about what is still suggested rather than silently shipping the accepted-only text: an
   insertion becomes [+…+], a deletion [-…-], a substitution [-old-][+new+]. Used by every
   export format when suggestions are pending. */
function blocksWithTrackedMarks(blocks: Block[], pending: Suggestion[]): Block[] {
  if (!pending.length) return blocks;
  return blocks.map((b) => {
    if (!("text" in b)) return b;
    let text = (b as { text: string }).text;
    const anchored = pending.filter((c) => c.blockId === b.id).sort((a, c) => (c.offset ?? 0) - (a.offset ?? 0));
    for (const c of anchored) {
      const at = Math.min(c.offset ?? text.length, text.length);
      const mark = (c.original ? `[-${c.original}-]` : "") + (c.replacement ? `[+${c.replacement}+]` : "");
      text = text.slice(0, at) + mark + text.slice(at + (c.original?.length || 0));
    }
    for (const c of pending) {
      if (c.blockId || !c.original) continue;
      if (text.includes(c.original)) text = text.replace(c.original, `[-${c.original}-][+${c.replacement}+]`);
    }
    return { ...b, text } as Block;
  });
}

export function DocumentSurface({ value, onChange, reloadNonce = 0, className, actions, config, readOnly, author, pageContext, footer, topBar, ...rest }: DocumentSurfaceProps) {
  const cfg = config || {};
  const showOutline = cfg.outline !== false;
  const showIO = cfg.importExport !== false && !readOnly;
  const showChrome = cfg.chrome !== false;
  const allowCover = cfg.cover !== false && showChrome;
  const allowIcon = cfg.icon !== false && showChrome;
  const showWordCount = cfg.wordCount !== false;
  const showFind = cfg.findReplace !== false;
  const showWidthToggle = cfg.pageWidthToggle !== false;

  const [snap, setSnap] = React.useState<DocumentSnapshot>(() => value ?? seedDocument());
  const onChangeRef = React.useRef(onChange); onChangeRef.current = onChange;
  const snapRef = React.useRef(snap); snapRef.current = snap;
  // reseed when the host forces a reload (mirrors WorkbookSurface's reloadNonce)
  React.useEffect(() => { const s = value ?? seedDocument(); snapRef.current = s; setSnap(s); /* eslint-disable-next-line */ }, [reloadNonce]);

  // compute next state from the ref and fire onChange OUTSIDE the setState updater — a
  // side effect inside an updater setStates the host during render (React warns)
  const patch = React.useCallback((p: Partial<DocumentSnapshot>) => {
    const n = { ...snapRef.current, ...p }; snapRef.current = n; setSnap(n); onChangeRef.current?.(n);
  }, []);
  const setBlocks = React.useCallback((blocks: Block[]) => patch({ blocks }), [patch]);

  // --- Suggesting mode: Word × Notion tracked changes ---
  const showSuggest = cfg.suggestions !== false && !readOnly;
  const [mode, setMode] = React.useState<"edit" | "suggest">("edit");
  const suggestions = React.useMemo(() => snap.suggestions ?? [], [snap.suggestions]);
  const setSuggestions = React.useCallback((next: Suggestion[]) => patch({ suggestions: next }), [patch]);
  const pendingSug = React.useMemo(() => suggestions.filter((c) => c.status === "pending"), [suggestions]);
  const sug = useSuggestions(snap.blocks, setBlocks, suggestions, setSuggestions);
  const [hoveredChange, setHoveredChange] = React.useState<string | null>(null);
  const [sugOpen, setSugOpen] = React.useState(false);
  const whoName = author?.name || "You";
  const whoColor = author?.color;

  // capture an edit as a tracked change instead of committing it (suggest mode). Each changed
  // block is diffed against its committed (original) text; one pending change per block, keyed
  // to the block, so repeated keystrokes REPLACE rather than stack. Structural edits (add/
  // remove/retype a block) commit straight through — v1 tracks TEXT edits within a block.
  const captureSuggestion = React.useCallback((nextBlocks: Block[]) => {
    const committed = snapRef.current.blocks;
    const sameShape = nextBlocks.length === committed.length && nextBlocks.every((b, i) => committed[i]?.id === b.id && committed[i]?.type === b.type);
    if (!sameShape) { patch({ blocks: nextBlocks }); return; }
    const byId = new Map(committed.map((b) => [b.id, b] as const));
    let nextSug = snapRef.current.suggestions ?? [];
    let touched = false;
    for (const nb of nextBlocks) {
      const ob = byId.get(nb.id); if (!ob) continue;
      const oldText = "text" in ob ? ob.text : ""; const newText = "text" in nb ? nb.text : "";
      if (oldText === newText) continue;
      touched = true;
      const sid = `sug-${nb.id}`;
      const region = diffRegion(oldText, newText);
      const rest = nextSug.filter((c) => c.id !== sid);
      nextSug = region && (region.original || region.replacement)
        ? [...rest, { id: sid, blockId: nb.id, offset: region.at, original: region.original, replacement: region.replacement, status: "pending", author: whoName, authorColor: whoColor, createdAt: Date.now() } as Suggestion]
        : rest;
    }
    if (touched) patch({ suggestions: nextSug });
  }, [patch, whoName, whoColor]);

  const onEditorChange = React.useCallback((next: Block[]) => {
    if (mode === "suggest") captureSuggestion(next); else setBlocks(next);
  }, [mode, captureSuggestion, setBlocks]);

  /* the LIVE tracked-change channel: the editor owns the in-block edit and reports the change on
     every keystroke, so the del/ins is already on screen — this only persists it. Keyed per block
     (`sug-<blockId>`) so repeated keystrokes replace rather than stack. */
  const onLiveSuggest = React.useCallback((blockId: string, change: { original: string; replacement: string; offset: number } | null) => {
    const sid = `sug-${blockId}`;
    const cur = snapRef.current.suggestions ?? [];
    const rest = cur.filter((c) => c.id !== sid);
    const next: Suggestion[] = change
      ? [...rest, { id: sid, blockId, offset: change.offset, original: change.original, replacement: change.replacement, status: "pending", author: whoName, authorColor: whoColor, createdAt: Date.now() } as Suggestion]
      : rest;
    patch({ suggestions: next });
  }, [patch, whoName, whoColor]);

  // when a change resolves the panel may empty; open it whenever there is something to review
  React.useEffect(() => { if (mode === "suggest" || suggestions.length) setSugOpen(true); }, [mode, suggestions.length]);

  const mainRef = React.useRef<HTMLDivElement | null>(null);
  // jump-to: scroll the doc to the block carrying a change and flash its inline widget
  const scrollToChange = React.useCallback((id: string) => {
    const ch = (snapRef.current.suggestions ?? []).find((c) => c.id === id); if (!ch) return;
    const needle = ch.original || ch.replacement;
    const blk = snapRef.current.blocks.find((b) => "text" in b && (b as { text: string }).text.includes(needle));
    if (blk) mainRef.current?.querySelector(`[data-testid="block-${blk.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHoveredChange(id);
  }, []);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [ioOpen, setIoOpen] = React.useState(false);
  const [findOpen, setFindOpen] = React.useState(false);
  const [findQ, setFindQ] = React.useState("");
  const [replaceQ, setReplaceQ] = React.useState("");
  const [caseSens, setCaseSens] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [iconOpen, setIconOpen] = React.useState(false);
  const [coverOpen, setCoverOpen] = React.useState(false);
  const touch = useTouchLayout();
  // on touch the outline is a SHEET — it must not be open on arrival, it would cover the doc
  const [outlineOn, setOutlineOn] = React.useState(() => showOutline && !(typeof window !== "undefined" && window.matchMedia("(pointer: coarse) and (max-width: 820px)").matches));

  const wide = snap.pageWidth === "wide";

  // word / char count (inline marks stripped)
  const counts = React.useMemo(() => {
    const text = snap.blocks.map((b) => (b.type === "table" ? b.rows.flat().join(" ") : "text" in b ? stripMarks(b.text) : "")).join(" ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return { words, chars: text.replace(/\s/g, "").length };
  }, [snap.blocks]);

  // find & replace
  const matchCount = React.useMemo(() => {
    if (!findQ) return 0;
    const re = new RegExp(escapeRe(findQ), caseSens ? "g" : "gi");
    let n = 0;
    for (const b of snap.blocks) { const t = b.type === "table" ? b.rows.flat().join("\n") : "text" in b ? b.text : ""; n += (t.match(re) || []).length; }
    return n;
  }, [findQ, snap.blocks, caseSens]);
  const replaceAll = () => {
    if (!findQ) return;
    const re = new RegExp(escapeRe(findQ), caseSens ? "g" : "gi");
    setBlocks(snap.blocks.map((b) => (b.type === "table" ? { ...b, rows: b.rows.map((r) => r.map((c) => c.replace(re, replaceQ))) } : "text" in b ? ({ ...b, text: b.text.replace(re, replaceQ) } as Block) : b)));
  };
  const jumpToMatch = () => {
    if (!findQ) return;
    const re = new RegExp(escapeRe(findQ), caseSens ? "" : "i");
    const hit = snap.blocks.find((b) => ("text" in b && re.test(b.text)) || (b.type === "table" && re.test(b.rows.flat().join("\n"))));
    if (hit) mainRef.current?.querySelector(`[data-testid="block-${hit.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // export / import
  const withBusy = async (label: string, fn: () => unknown) => { setBusy(label); setIoOpen(false); try { await fn(); } finally { setBusy(null); } };
  // exports render pending tracked changes as visible marks so nothing is silently dropped
  const exportBlocks = pendingSug.length > 0 ? blocksWithTrackedMarks(snap.blocks, pendingSug) : snap.blocks;
  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true); setIoOpen(false);
    try {
      const { blocks } = await importFile(file);
      const title = snap.title.trim() || file.name.replace(/\.[^.]+$/, "");
      patch({ blocks, title });
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // close the io menu on an outside click
  React.useEffect(() => {
    if (!ioOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".nxDoc-io")) setIoOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ioOpen]);

  const cover = coverBackground(snap.cover, snap.coverY);

  /* drag-to-reposition an uploaded image cover: the drag maps vertical travel to the
     background's focal point, so the user frames the image in place (Notion's gesture). */
  const [reposition, setReposition] = React.useState(false);
  const coverElRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ y: number; start: number } | null>(null);
  React.useEffect(() => {
    if (!reposition) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current; const h = coverElRef.current?.offsetHeight || 190;
      if (!d) return;
      // a full drag across the cover's height sweeps the whole focal range
      patch({ coverY: Math.max(0, Math.min(100, d.start - ((e.clientY - d.y) / h) * 100)) });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [reposition, patch]);

  return (
    <div className={["nxDoc", wide ? "is-wide" : "is-narrow", className].filter(Boolean).join(" ")} {...rest}>
      {/* ONE header row. A host that supplies a `topBar` (breadcrumbs) owns the left side —
          the surface does NOT then repeat the document title, which would stack a second
          heading above the page's own H1. */}
      <div className="nxDoc-bar" data-testid="doc-toolbar">
        <div className="nxDoc-bar-l">
          {topBar ?? (
            <span className="nxDoc-crumb">{snap.icon && <span className="nxDoc-crumb-ic">{snap.icon}</span>}{snap.title || "Untitled"}</span>
          )}
        </div>
        <div className="nxDoc-bar-r">
          {showWordCount && <span className="nxDoc-count" data-testid="doc-wordcount">{counts.words} {counts.words === 1 ? "word" : "words"} · {counts.chars} chars</span>}
          {busy && <span className="nxDoc-busy">{busy}…</span>}
          {importing && <span className="nxDoc-busy">Importing…</span>}
          {showSuggest && (
            <div className="nxDoc-modeswitch" data-testid="doc-mode-switch" role="radiogroup" aria-label="Editing mode">
              <button className={`nxDoc-mode${mode === "edit" ? " is-on" : ""}`} data-testid="doc-mode-edit" role="radio" aria-checked={mode === "edit"} title="Editing — changes apply directly" onClick={() => setMode("edit")}><PenLine size={13} /> Editing</button>
              <button className={`nxDoc-mode${mode === "suggest" ? " is-on" : ""}`} data-testid="doc-mode-suggest" role="radio" aria-checked={mode === "suggest"} title="Suggesting — your edits become tracked changes" onClick={() => setMode("suggest")}><MessageSquareText size={13} /> Suggesting</button>
            </div>
          )}
          {showSuggest && (suggestions.length > 0) && (
            <button className={`nxDoc-btn${sugOpen ? " is-on" : ""}`} title="Review suggestions" data-testid="doc-suggest-toggle" onClick={() => setSugOpen((v) => !v)}>
              <MessageSquareText size={15} />{sug.pending > 0 && <span className="nxDoc-badge">{sug.pending}</span>}
            </button>
          )}
          {showFind && (
            <button className={`nxDoc-btn${findOpen ? " is-on" : ""}`} title="Find & replace" data-testid="doc-find-toggle" onClick={() => setFindOpen((v) => !v)}><Search size={15} /></button>
          )}
          {showWidthToggle && (
            <button className="nxDoc-btn" title={wide ? "Narrow page" : "Wide page"} data-testid="doc-width-toggle" onClick={() => patch({ pageWidth: wide ? "narrow" : "wide" })}>{wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
          )}
          {showOutline && (
            <button className={`nxDoc-btn${outlineOn ? " is-on" : ""}`} title="Toggle outline" data-testid="doc-outline-toggle" onClick={() => setOutlineOn((v) => !v)}><PanelRight size={15} /></button>
          )}
          {showIO && (
            <div className="nxDoc-io">
              <button className="nxDoc-btn nxDoc-btn-primary" data-testid="doc-io-menu" onClick={() => setIoOpen((v) => !v)}><Download size={14} /> Export <ChevronDown size={13} /></button>
              {ioOpen && (
                <div className="nxDoc-io-pop nx-pop-in" data-testid="doc-io-pop">
                  <div className="nxDoc-io-h">Export{pendingSug.length > 0 ? ` · ${pendingSug.length} tracked change${pendingSug.length === 1 ? "" : "s"} marked` : ""}</div>
                  <button data-testid="export-md" onClick={() => withBusy("Markdown", () => exportMarkdown(exportBlocks, snap.title))}><FileText size={15} /> Markdown (.md)</button>
                  <button data-testid="export-html" onClick={() => withBusy("HTML", () => exportHtml(exportBlocks, snap.title))}><FileCode size={15} /> HTML (.html)</button>
                  <button data-testid="export-pdf" onClick={() => withBusy("PDF", () => exportPdf(exportBlocks, snap.title))}><FileType size={15} /> PDF (print)</button>
                  <button data-testid="export-docx" onClick={() => withBusy("Word", () => exportDocx(exportBlocks, snap.title))}><FileText size={15} /> Word (.docx)</button>
                  <div className="nxDoc-io-h">Import</div>
                  <button data-testid="import-file" onClick={() => { setIoOpen(false); fileRef.current?.click(); }}><Upload size={15} /> From file (.docx, .md, .html)</button>
                </div>
              )}
            </div>
          )}
          {actions}
        </div>
      </div>

      {/* find & replace bar */}
      {showFind && findOpen && (
        <div className="nxDoc-find" data-testid="doc-find-bar">
          <Search size={14} className="nxDoc-find-ic" />
          <input autoFocus placeholder="Find" value={findQ} data-testid="find-input" onChange={(e) => setFindQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") jumpToMatch(); }} />
          <span className="nxDoc-find-n" data-testid="find-count">{findQ ? `${matchCount}` : "0"}</span>
          <Replace size={14} className="nxDoc-find-ic" />
          <input placeholder="Replace with" value={replaceQ} data-testid="replace-input" onChange={(e) => setReplaceQ(e.target.value)} />
          <button className="nxDoc-find-btn" onClick={() => setCaseSens((v) => !v)} data-testid="find-case" title="Match case" aria-pressed={caseSens}>Aa</button>
          <button className="nxDoc-find-btn" onClick={jumpToMatch} data-testid="find-next" disabled={!matchCount}>Next</button>
          <button className="nxDoc-find-btn is-primary" onClick={replaceAll} data-testid="replace-all" disabled={!matchCount}>Replace all</button>
          <button className="nxDoc-find-x" onClick={() => setFindOpen(false)} title="Close"><X size={14} /></button>
        </div>
      )}

      {/* body: document main + outline rail */}
      <div className="nxDoc-body">
        <div className="nxDoc-main" ref={mainRef} data-testid="doc-scroll">
          {allowCover && (snap.cover ? (
            <div className={`nxDoc-cover${reposition ? " is-repositioning" : ""}`} data-testid="doc-cover" ref={coverElRef} style={{ background: cover }}
              onPointerDown={(e) => { if (reposition) { dragRef.current = { y: e.clientY, start: snap.coverY ?? 50 }; e.preventDefault(); } }}>
              {!readOnly && (reposition ? (
                <div className="nxDoc-cover-ctl is-open" data-testid="cover-reposition-bar">
                  <span className="nxDoc-cover-hint"><ImageIcon size={13} /> Drag the image to reframe it</span>
                  <button className="is-primary" data-testid="cover-reposition-done" onClick={() => setReposition(false)}><Check size={13} /> Done</button>
                </div>
              ) : (
                <div className="nxDoc-cover-ctl">
                  <button data-testid="cover-change" onClick={() => setCoverOpen((v) => !v)}>Change cover</button>
                  {!isPresetCover(snap.cover) && <button data-testid="cover-reposition-open" onClick={() => setReposition(true)}>Reposition</button>}
                </div>
              ))}
              {coverOpen && !readOnly && (
                <CoverPicker value={snap.cover} sheet={touch}
                  onPick={(c) => { patch({ cover: c, coverY: 50 }); setCoverOpen(false); }}
                  onRemove={() => patch({ cover: undefined, coverY: undefined })}
                  onReposition={() => setReposition(true)}
                  onClose={() => setCoverOpen(false)} />
              )}
            </div>
          ) : null)}

          <div className={`nxDoc-page${snap.cover ? " has-cover" : ""}`}>
            {showChrome && (
              <div className="nxDoc-head">
                <div className="nxDoc-head-ctl">
                  {allowIcon && <div className="nxDoc-iconwrap">
                    <button className="nxDoc-icon" data-testid="doc-icon" disabled={readOnly}
                      onClick={() => { if (!readOnly) setIconOpen((v) => !v); }}
                      title={snap.icon ? "Change icon" : "Add an icon"}>
                      {snap.icon ? <PageIcon icon={snap.icon} size={46} /> : "＋"}
                    </button>
                    {iconOpen && !readOnly && (
                      <IconPicker value={snap.icon} sheet={touch}
                        onPick={(icon) => { patch({ icon }); setIconOpen(false); }}
                        onRemove={() => patch({ icon: undefined })}
                        onClose={() => setIconOpen(false)} />
                    )}
                  </div>}
                  {!readOnly && allowCover && !snap.cover && (
                    <div className="nxDoc-iconwrap">
                      <button className="nxDoc-addcover" data-testid="doc-add-cover" onClick={() => setCoverOpen((v) => !v)}><ImageIcon size={13} /> Add cover</button>
                      {coverOpen && (
                        <CoverPicker sheet={touch}
                          onPick={(c) => { patch({ cover: c, coverY: 50 }); setCoverOpen(false); }}
                          onRemove={() => patch({ cover: undefined })}
                          onClose={() => setCoverOpen(false)} />
                      )}
                    </div>
                  )}
                </div>
                <input className="nxDoc-title" data-testid="doc-title" value={snap.title} readOnly={readOnly}
                  placeholder="Untitled" onChange={(e) => patch({ title: e.target.value })} />
              </div>
            )}
            <NotionEditor blocks={snap.blocks} onChange={onEditorChange} readOnly={readOnly} config={cfg.editor} pageContext={pageContext}
              changes={mode === "suggest" || suggestions.length ? pendingSug : undefined}
              suggesting={mode === "suggest"} suggestAuthor={{ name: whoName, color: whoColor }}
              onSuggestChange={onLiveSuggest}
              hoveredChange={hoveredChange} onHoverChange={setHoveredChange} />
            {footer}
          </div>
        </div>

        {/* the outline is a RAIL with room for a third column, and a bottom SHEET without
            one — reachable either way, never a squeezed column stealing reading width */}
        {showOutline && outlineOn && !touch && (
          <aside className="nxDoc-rail" data-testid="doc-rail">
            <DocumentOutline blocks={snap.blocks} containerRef={mainRef} />
          </aside>
        )}

        {/* the review rail — inline tracked changes' accept/reject/jump-to, alongside the doc */}
        {showSuggest && sugOpen && suggestions.length > 0 && !touch && (
          <aside className="nxDoc-rail nxDoc-rail-sug" data-testid="doc-suggest-rail">
            <SuggestionPanel changes={suggestions} hovered={hoveredChange} onHover={setHoveredChange}
              onFocus={scrollToChange} onAccept={sug.accept} onReject={sug.reject} onUndo={sug.undo}
              onAcceptAll={sug.acceptAll} onRejectAll={sug.rejectAll} onComment={(id, note) => setSuggestions((snapRef.current.suggestions ?? []).map((c) => c.id === id ? { ...c, reason: note } as Suggestion : c))} />
          </aside>
        )}
      </div>

      {showSuggest && sugOpen && suggestions.length > 0 && touch && (
        <>
          <div className="nxDoc-scrim" data-testid="suggest-scrim" onClick={() => setSugOpen(false)} />
          <aside className="nxDoc-outline-sheet" data-testid="doc-suggest-sheet">
            <div className="nxDoc-sheet-grip" />
            <div className="nxDoc-sheet-head"><MessageSquareText size={14} /> Suggestions
              <button onClick={() => setSugOpen(false)} data-testid="suggest-sheet-close" aria-label="Close suggestions"><X size={16} /></button>
            </div>
            <div className="nxDoc-sheet-body">
              <SuggestionPanel changes={suggestions} hovered={hoveredChange} onHover={setHoveredChange}
                onFocus={(id) => { scrollToChange(id); setSugOpen(false); }} onAccept={sug.accept} onReject={sug.reject} onUndo={sug.undo}
                onAcceptAll={sug.acceptAll} onRejectAll={sug.rejectAll} onComment={(id, note) => setSuggestions((snapRef.current.suggestions ?? []).map((c) => c.id === id ? { ...c, reason: note } as Suggestion : c))} />
            </div>
          </aside>
        </>
      )}

      {showOutline && outlineOn && touch && (
        <>
          <div className="nxDoc-scrim" data-testid="outline-scrim" onClick={() => setOutlineOn(false)} />
          <aside className="nxDoc-outline-sheet" data-testid="doc-outline-sheet">
            <div className="nxDoc-sheet-grip" />
            <div className="nxDoc-sheet-head"><ListTree size={14} /> Outline
              <button onClick={() => setOutlineOn(false)} data-testid="outline-sheet-close" aria-label="Close outline"><X size={16} /></button>
            </div>
            <div className="nxDoc-sheet-body">
              <DocumentOutline blocks={snap.blocks} containerRef={mainRef} onNavigate={() => setOutlineOn(false)} />
            </div>
          </aside>
        </>
      )}

      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} style={{ display: "none" }} onChange={(e) => void onImport(e.target.files?.[0])} />
    </div>
  );
}

export default DocumentSurface;
