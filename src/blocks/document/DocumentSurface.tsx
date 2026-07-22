import * as React from "react";
import { NotionEditor, type Block, type EditorConfig } from "../../record-core/NotionEditor";
import { DocumentOutline } from "../../record-core/DocumentOutline";
import { exportMarkdown, exportHtml, exportPdf, exportDocx, importFile, IMPORT_ACCEPT } from "../../record-core/editor-io";
import { seedDocument, coverBackground, COVER_PRESETS, type DocumentSnapshot } from "./snapshot";
import { PanelRight, Search, Download, Upload, FileText, FileCode, FileType, Image as ImageIcon, ChevronDown, X, Maximize2, Minimize2, Replace } from "lucide-react";
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
  wordCount?: boolean;          // the word/char readout (default true)
  findReplace?: boolean;        // the find & replace bar (default true)
  pageWidthToggle?: boolean;    // narrow/wide toggle (default true)
}

export interface DocumentSurfaceProps {
  value: DocumentSnapshot | null;
  onChange?: (snapshot: DocumentSnapshot) => void;
  reloadNonce?: number;
  className?: string;
  actions?: React.ReactNode;
  config?: DocumentConfig;
  readOnly?: boolean;
  "data-testid"?: string;
}

const TITLE_EMOJIS = ["📄", "📝", "📘", "🚀", "✨", "🎯", "🧭", "📊", "🔬", "🗂️", "💡", "🏗️"];
const stripMarks = (t: string) =>
  t.replace(/\[\[[ch]:[a-z]+\|([^\]]*)\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|~~|\+\+|==|`|\*|_|^#{1,3}\s)/gm, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function DocumentSurface({ value, onChange, reloadNonce = 0, className, actions, config, readOnly, ...rest }: DocumentSurfaceProps) {
  const cfg = config || {};
  const showOutline = cfg.outline !== false;
  const showIO = cfg.importExport !== false && !readOnly;
  const showChrome = cfg.chrome !== false;
  const allowCover = cfg.cover !== false && showChrome;
  const showWordCount = cfg.wordCount !== false;
  const showFind = cfg.findReplace !== false;
  const showWidthToggle = cfg.pageWidthToggle !== false;

  const [snap, setSnap] = React.useState<DocumentSnapshot>(() => value ?? seedDocument());
  const onChangeRef = React.useRef(onChange); onChangeRef.current = onChange;
  // reseed when the host forces a reload (mirrors WorkbookSurface's reloadNonce)
  React.useEffect(() => { setSnap(value ?? seedDocument()); /* eslint-disable-next-line */ }, [reloadNonce]);

  const patch = React.useCallback((p: Partial<DocumentSnapshot>) => {
    setSnap((s) => { const n = { ...s, ...p }; onChangeRef.current?.(n); return n; });
  }, []);
  const setBlocks = React.useCallback((blocks: Block[]) => patch({ blocks }), [patch]);

  const mainRef = React.useRef<HTMLDivElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [ioOpen, setIoOpen] = React.useState(false);
  const [outlineOn, setOutlineOn] = React.useState(showOutline);
  const [findOpen, setFindOpen] = React.useState(false);
  const [findQ, setFindQ] = React.useState("");
  const [replaceQ, setReplaceQ] = React.useState("");
  const [caseSens, setCaseSens] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

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

  const cover = coverBackground(snap.cover);
  const cycleCover = () => { const keys = Object.keys(COVER_PRESETS); const i = keys.indexOf(snap.cover || ""); patch({ cover: keys[(i + 1) % keys.length] }); };
  const uploadCover = (file?: File) => { if (!file) return; const r = new FileReader(); r.onload = () => patch({ cover: String(r.result) }); r.readAsDataURL(file); };
  const coverFileRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div className={["nxDoc", wide ? "is-wide" : "is-narrow", className].filter(Boolean).join(" ")} {...rest}>
      {/* toolbar */}
      <div className="nxDoc-bar" data-testid="doc-toolbar">
        <div className="nxDoc-bar-l">
          <span className="nxDoc-crumb">{snap.icon && <span className="nxDoc-crumb-ic">{snap.icon}</span>}{snap.title || "Untitled"}</span>
          {showWordCount && <span className="nxDoc-count" data-testid="doc-wordcount">{counts.words} words · {counts.chars} chars</span>}
        </div>
        <div className="nxDoc-bar-r">
          {busy && <span className="nxDoc-busy">{busy}…</span>}
          {importing && <span className="nxDoc-busy">Importing…</span>}
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
                  <div className="nxDoc-io-h">Export</div>
                  <button data-testid="export-md" onClick={() => withBusy("Markdown", () => exportMarkdown(snap.blocks, snap.title))}><FileText size={15} /> Markdown (.md)</button>
                  <button data-testid="export-html" onClick={() => withBusy("HTML", () => exportHtml(snap.blocks, snap.title))}><FileCode size={15} /> HTML (.html)</button>
                  <button data-testid="export-pdf" onClick={() => withBusy("PDF", () => exportPdf(snap.blocks, snap.title))}><FileType size={15} /> PDF (print)</button>
                  <button data-testid="export-docx" onClick={() => withBusy("Word", () => exportDocx(snap.blocks, snap.title))}><FileText size={15} /> Word (.docx)</button>
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
            <div className="nxDoc-cover" data-testid="doc-cover" style={{ background: cover }}>
              {!readOnly && (
                <div className="nxDoc-cover-ctl">
                  <button onClick={cycleCover} data-testid="cover-change">Change</button>
                  <button onClick={() => coverFileRef.current?.click()}>Upload</button>
                  <button onClick={() => patch({ cover: undefined })} data-testid="cover-remove">Remove</button>
                </div>
              )}
            </div>
          ) : null)}

          <div className={`nxDoc-page${snap.cover ? " has-cover" : ""}`}>
            {showChrome && (
              <div className="nxDoc-head">
                <div className="nxDoc-head-ctl">
                  <button className="nxDoc-icon" data-testid="doc-icon" disabled={readOnly}
                    onClick={() => { if (readOnly) return; const i = TITLE_EMOJIS.indexOf(snap.icon || ""); patch({ icon: TITLE_EMOJIS[(i + 1) % TITLE_EMOJIS.length] }); }}
                    title="Change icon">{snap.icon || "＋"}</button>
                  {!readOnly && allowCover && !snap.cover && (
                    <button className="nxDoc-addcover" data-testid="doc-add-cover" onClick={cycleCover}><ImageIcon size={13} /> Add cover</button>
                  )}
                </div>
                <input className="nxDoc-title" data-testid="doc-title" value={snap.title} readOnly={readOnly}
                  placeholder="Untitled" onChange={(e) => patch({ title: e.target.value })} />
              </div>
            )}
            <NotionEditor blocks={snap.blocks} onChange={setBlocks} readOnly={readOnly} config={cfg.editor} />
          </div>
        </div>

        {showOutline && outlineOn && (
          <aside className="nxDoc-rail" data-testid="doc-rail">
            <DocumentOutline blocks={snap.blocks} containerRef={mainRef} />
          </aside>
        )}
      </div>

      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} style={{ display: "none" }} onChange={(e) => void onImport(e.target.files?.[0])} />
      <input ref={coverFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadCover(e.target.files?.[0])} />
    </div>
  );
}

export default DocumentSurface;
