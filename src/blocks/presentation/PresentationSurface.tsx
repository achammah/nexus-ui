import * as React from "react";
import type { DeckMaster, DeckSnapshot, DeckThemeId, PresentationConfig, Slide, SlideBlocks, SlideLayout, SlideTemplate, SlideTransition } from "./types";
import { uid } from "./types";
import { applyViewEvent, createSlide, isDeckSnapshot, isStaleSeed, seedDeck } from "./snapshot";
import { LAYOUTS, SlideView, textOf } from "./SlideView";
import { ElementLayer } from "./ElementLayer";
import { ColorWell, ElementBar, FONT_STACKS, InsertMenu } from "./ElementControls";
import { IconAction, PickerMenu, SectionTabs, TextAction } from "./chrome";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { TooltipProvider } from "../../components/ui/tooltip";
import { Button } from "../../primitives/Button";
import {
  Bold,
  ChartNoAxesColumn,
  Copy,
  Download,
  FileDown,
  Italic,
  LayoutTemplate,
  List,
  ListOrdered,
  MessageSquareText,
  Play,
  Plus,
  Presentation as PresentationIcon,
  Redo2,
  Share2,
  Palette,
  Trash2,
  Underline,
  Undo2,
  Upload,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  addElement,
  createImageElement,
  createChart,
  createShape,
  createTable,
  createTextBox,
  createVideo,
  duplicateElements,
  els,
  removeElements,
} from "./elements";
import { FitSlide, PresentMode } from "./PresentMode";
import { AnalyticsPanel, RoomsPanel, SharePanel } from "./SharePanels";
import { PresentationViewer } from "./PresentationViewer";
import { exportDeckToPdf, exportDeckToPptx } from "./export";
import { importPptx } from "./import";
import "./presentation.css";

export interface PresentationSurfaceProps {
  /* the deck to load; null/invalid seeds the demo deck */
  value: DeckSnapshot | null;
  /* fired on every persisted change — the host debounces + stores the blob */
  onChange?: (snapshot: DeckSnapshot) => void;
  /* bump to force a re-adopt of `value` (reset, external reload) */
  reloadNonce?: number;
  config?: PresentationConfig;
  className?: string;
  /* host controls (save state, reset) — rendered at the right end of the top bar */
  actions?: React.ReactNode;
  "data-testid"?: string;
}

const THEMES: Array<{ id: DeckThemeId; label: string }> = [
  { id: "native", label: "Native" },
  { id: "paper", label: "Paper" },
  { id: "midnight", label: "Midnight" },
  { id: "accent", label: "Accent" },
  { id: "gradient", label: "Gradient" },
];

const TRANSITIONS: SlideTransition[] = ["none", "fade", "slide", "zoom"];

type Tab = "slides" | "share" | "analytics" | "rooms";

const MASTER_FONT_OPTIONS = [
  { value: "theme", label: "Theme font" },
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
  { value: "display", label: "Display" },
];
const masterFontValue = (family?: string): string =>
  (Object.entries(FONT_STACKS).find(([, v]) => v === family)?.[0] as string | undefined) ?? "theme";

/* PresentationSurface — a full deck editor (filmstrip + 16:9 canvas + notes +
   present mode + export) with the papermark layer (share links, viewer preview,
   per-slide analytics, data rooms) behind tabs. Free-surface contract: the host
   owns persistence, this component owns everything inside. */
export function PresentationSurface({
  value,
  onChange,
  reloadNonce = 0,
  config,
  className,
  actions,
  ...rest
}: PresentationSurfaceProps) {
  const feat = {
    share: true,
    analytics: true,
    rooms: true,
    pptxExport: true,
    pptxImport: true,
    pdfExport: true,
    present: true,
    ...config?.features,
  };

  /* adopt value on mount + on reloadNonce; edits flow deck -> onChange upward */
  /* adopt: invalid -> seed; a stored deck that is an UNTOUCHED older seed also
     re-seeds (demo installs receive seed upgrades; edited decks are never touched) */
  const adopt = (v: DeckSnapshot | null): DeckSnapshot =>
    isDeckSnapshot(v) ? (isStaleSeed(v) ? seedDeck() : v) : seedDeck();
  const [deck, setDeck] = React.useState<DeckSnapshot>(() => adopt(value));
  React.useEffect(() => {
    setDeck(adopt(value));
    // adopt exactly when the host asks (initial value is captured by useState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadNonce]);

  /* a stale-seed replacement must reach the host store too, or shared-link
     viewers (which read the stored blob) would keep serving the old deck */
  React.useEffect(() => {
    if (isDeckSnapshot(value) && isStaleSeed(value)) onChangeRef.current?.(deckRef.current);
    // mount + explicit re-adopt only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadNonce]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const update = React.useCallback((next: DeckSnapshot) => {
    setDeck(next);
    onChangeRef.current?.(next);
  }, []);

  /* ---- document history (undo/redo) ----
     ONE history for the whole deck, as Slides/Pitch have: structural ops push a
     step each; continuous edits (typing a title, dragging an expiry) COALESCE
     into one step while the same tag keeps firing inside the window, so ⌘Z
     undoes a word-burst rather than a keystroke. Native contentEditable undo
     still owns caret-level text history INSIDE a focused region — this stack is
     what catches the destructive ops (delete slide, delete link) that had no
     undo path at all. Analytics folds are NOT history (they are viewer facts). */
  const deckRef = React.useRef(deck);
  deckRef.current = deck;
  const histRef = React.useRef<{ past: DeckSnapshot[]; future: DeckSnapshot[]; tag: string | null; at: number }>({
    past: [],
    future: [],
    tag: null,
    at: 0,
  });
  const [histTick, setHistTick] = React.useState(0);
  const HIST_CAP = 60;
  const COALESCE_MS = 700;

  const commit = React.useCallback(
    (next: DeckSnapshot, tag?: string) => {
      const h = histRef.current;
      const now = Date.now();
      const coalesce = tag != null && h.tag === tag && now - h.at < COALESCE_MS && h.past.length > 0;
      if (!coalesce) {
        h.past.push(deckRef.current);
        if (h.past.length > HIST_CAP) h.past.shift();
      }
      h.future = [];
      h.tag = tag ?? null;
      h.at = now;
      setHistTick((v) => v + 1);
      update(next);
    },
    [update],
  );

  const undo = React.useCallback(() => {
    const h = histRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(deckRef.current);
    h.tag = null;
    setHistTick((v) => v + 1);
    update(prev);
  }, [update]);

  const redo = React.useCallback(() => {
    const h = histRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(deckRef.current);
    h.tag = null;
    setHistTick((v) => v + 1);
    update(next);
  }, [update]);

  /* a host-driven re-adopt is a new document — the old history no longer applies */
  React.useEffect(() => {
    histRef.current = { past: [], future: [], tag: null, at: 0 };
    setHistTick((v) => v + 1);
  }, [reloadNonce]);

  const canUndo = histRef.current.past.length > 0;
  const canRedo = histRef.current.future.length > 0;
  void histTick; // canUndo/canRedo read a ref; the tick is what re-renders them

  const [tab, setTab] = React.useState<Tab>("slides");
  const [sel, setSel] = React.useState(0);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [presenting, setPresenting] = React.useState(false);
  const [previewSlug, setPreviewSlug] = React.useState<string | null>(null);
  const [busyExport, setBusyExport] = React.useState<null | "pptx" | "import">(null);
  const [importReport, setImportReport] = React.useState<{ n: number; warnings: string[] } | null>(null);
  const pptxRef = React.useRef<HTMLInputElement>(null);
  const [selEls, setSelEls] = React.useState<string[]>([]);
  /* which text surface has focus — drives the contextual formatting bar */
  const [textFocus, setTextFocus] = React.useState(false);
  /* what an image pick should do: replace the layout's image region, insert an
     element, or set the deck-master logo */
  const imageIntent = React.useRef<"region" | "element" | "logo">("region");
  const [masterOpen, setMasterOpen] = React.useState(false);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [dropIdx, setDropIdx] = React.useState<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);

  const slide = deck.slides[Math.min(sel, deck.slides.length - 1)];
  const selIdx = Math.min(sel, deck.slides.length - 1);

  /* ---- slide ops ---- */
  const patchSlide = (id: string, p: Partial<Slide>, tag?: string) =>
    commit({ ...deck, slides: deck.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) }, tag);
  const setBlock = (key: keyof SlideBlocks, html: string) =>
    patchSlide(slide.id, { blocks: { ...slide.blocks, [key]: html } }, `text:${slide.id}:${key}`);

  /* ---- free-placement elements ----
     A gesture streams DRAFTS (no history) and lands ONE commit on pointer-up. */
  const putSlide = (next: Slide, mode: "draft" | "commit") => {
    const deckNext = { ...deck, slides: deck.slides.map((x) => (x.id === next.id ? next : x)) };
    if (mode === "draft") update(deckNext);
    else commit(deckNext);
  };
  const insertElement = (make: () => Slide) => {
    const next = make();
    putSlide(next, "commit");
    const added = els(next)[els(next).length - 1];
    if (added) setSelEls([added.id]);
  };
  const deleteSelectedEls = () => {
    if (!selEls.length) return;
    putSlide(removeElements(slide, selEls), "commit");
    setSelEls([]);
  };
  const duplicateSelectedEls = () => {
    if (!selEls.length) return;
    const { slide: next, newIds } = duplicateElements(slide, selEls);
    putSlide(next, "commit");
    setSelEls(newIds);
  };
  const nudge = (dx: number, dy: number) => {
    if (!selEls.length) return;
    let next = slide;
    for (const id of selEls) {
      const e = els(next).find((x) => x.id === id);
      if (e) next = { ...next, elements: els(next).map((x) => (x.id === id ? { ...x, x: x.x + dx, y: x.y + dy } : x)) };
    }
    putSlide(next, "commit");
  };

  const addSlide = (layout: SlideLayout) => {
    const s = createSlide(layout);
    const slides = deck.slides.slice();
    slides.splice(selIdx + 1, 0, s);
    commit({ ...deck, slides });
    setSel(selIdx + 1);
  };
  const duplicateSlide = (i: number) => {
    const src = deck.slides[i];
    const copy: Slide = { ...src, id: `sl-${uid()}`, blocks: { ...src.blocks } };
    const slides = deck.slides.slice();
    slides.splice(i + 1, 0, copy);
    commit({ ...deck, slides });
    setSel(i + 1);
  };
  const deleteSlide = (i: number) => {
    if (deck.slides.length <= 1) return;
    const slides = deck.slides.filter((_, x) => x !== i);
    commit({ ...deck, slides });
    setSel(Math.max(0, Math.min(i, slides.length - 1)));
  };
  const moveSlide = (from: number, to: number) => {
    if (from === to || to < 0 || to >= deck.slides.length) return;
    const slides = deck.slides.slice();
    const [s] = slides.splice(from, 1);
    slides.splice(to, 0, s);
    commit({ ...deck, slides });
    setSel(to);
  };

  /* rich-text commands act on the focused contentEditable selection.
     execCommand is deprecated-but-universal; scope is bold/italic/underline/lists,
     which every engine still ships. */
  const fmt = (cmd: string) => {
    document.execCommand(cmd);
    // persist the mutated region (execCommand doesn't fire React onInput reliably everywhere)
    const active = document.activeElement as HTMLElement | null;
    active?.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const pickImage = (intent: "region" | "element" | "logo" = "region") => {
    imageIntent.current = intent;
    fileRef.current?.click();
  };
  const onImageFile = (f: File | undefined) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result);
      if (imageIntent.current === "element") insertElement(() => addElement(slide, createImageElement(src)));
      else if (imageIntent.current === "logo")
        setMaster({ logo: { src, pos: deck.master?.logo?.pos ?? "br", size: deck.master?.logo?.size ?? 40 } });
      else setBlock("imageUrl", src);
    };
    fr.readAsDataURL(f);
  };

  /* ---- deck master + templates ---- */
  const setMaster = (patch: Partial<DeckMaster>) =>
    commit({ ...deck, master: { ...deck.master, ...patch } }, "master");
  const setMasterFooter = (patch: Partial<NonNullable<DeckMaster["footer"]>>) =>
    setMaster({ footer: { ...deck.master?.footer, ...patch } });

  const saveTemplate = () => {
    const { id: _drop, ...rest } = slide;
    const name = textOf(slide.blocks.title) || `${LAYOUTS[slide.layout].label} template`;
    const tpl: SlideTemplate = { id: `tpl-${uid()}`, name, slide: structuredClone(rest) };
    commit({ ...deck, templates: [...(deck.templates ?? []), tpl] });
  };
  const insertTemplate = (tpl: SlideTemplate) => {
    const s: Slide = {
      ...structuredClone(tpl.slide),
      id: `sl-${uid()}`,
      elements: (tpl.slide.elements ?? []).map((e) => ({ ...e, id: `el-${uid()}` })),
    };
    const slides = deck.slides.slice();
    slides.splice(selIdx + 1, 0, s);
    commit({ ...deck, slides });
    setSel(selIdx + 1);
  };
  const removeTemplate = (id: string) =>
    commit({ ...deck, templates: (deck.templates ?? []).filter((t) => t.id !== id) });

  const doPdf = () => {
    const el = surfaceRef.current?.querySelector(".nxPresCanvas .nxPresSlide") as HTMLElement | null;
    const cs = el ? getComputedStyle(el) : null;
    /* resolve the live theme to literal colors for the print window (it has no
       token stylesheet). Type scale mirrors presentation.css. */
    const themeCss = `
      .slide { background: ${cs?.backgroundColor ?? "#fff"}; color: ${cs?.color ?? "#111"}; font-family: ${cs?.fontFamily ?? "sans-serif"}; }
      .nxPresTitle { font-size: 42pt; font-weight: 700; } .nxPresSubtitle { font-size: 16pt; opacity: .72; }
      .nxPresH { font-size: 24pt; font-weight: 700; } .nxPresBody, .nxPresCol { font-size: 13pt; line-height: 1.5; }
      .nxPresSection { font-size: 34pt; font-weight: 700; } .nxPresQuote { font-size: 22pt; font-style: italic; }
      .nxPresAttribution, .nxPresCaption { font-size: 11pt; opacity: .72; }
      ul,ol { margin: .3em 0 .3em 1.2em; } li { margin: .18em 0; }`;
    exportDeckToPdf(deck, themeCss);
  };
  /* PPTX import — appends the imported slides after the current one, so an
     import never destroys what is already in the deck. */
  const onPptxFile = async (f: File | undefined) => {
    if (!f) return;
    setBusyExport("import");
    try {
      const res = await importPptx(f);
      if (!res.slides.length) {
        setImportReport({ n: 0, warnings: res.warnings.length ? res.warnings : ["Nothing could be read from that file."] });
        return;
      }
      const slides = deck.slides.slice();
      slides.splice(selIdx + 1, 0, ...res.slides);
      commit({ ...deck, slides });
      setSel(selIdx + 1);
      setSelEls([]);
      setImportReport({ n: res.slides.length, warnings: res.warnings });
    } catch (err) {
      setImportReport({ n: 0, warnings: [`Import failed: ${(err as Error).message}`] });
    } finally {
      setBusyExport(null);
      if (pptxRef.current) pptxRef.current.value = "";
    }
  };

  const doPptx = async () => {
    setBusyExport("pptx");
    try {
      await exportDeckToPptx(deck);
    } finally {
      setBusyExport(null);
    }
  };

  /* keyboard: filmstrip-level shortcuts only when focus is NOT inside a text region */
  const onSurfaceKey = (e: React.KeyboardEvent) => {
    const inText = (e.target as HTMLElement).closest('[contenteditable="true"], input, textarea');
    /* ⌘Z/⌘⇧Z reach the document history even from inside a text region ONLY when
       that region has nothing of its own left to undo would be unknowable, so we
       leave native undo to own focused text and take the shortcut elsewhere. */
    if (inText) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (selEls.length && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      /* an element selection turns the arrows into a nudge (1px, 10px with shift) */
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      setSel((i) => Math.min(deck.slides.length - 1, i + 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      setSel((i) => Math.max(0, i - 1));
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "d") {
      e.preventDefault();
      if (selEls.length) duplicateSelectedEls();
      else duplicateSlide(selIdx);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (selEls.length) deleteSelectedEls();
      else deleteSlide(selIdx);
    } else if (e.key === "Escape" && selEls.length) {
      /* Escape belongs to the topmost layer: if a menu is open it closes that,
         and must NOT also throw away the element selection underneath. */
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      e.preventDefault();
      setSelEls([]);
    } else if (e.key === "F5" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      if (feat.present) setPresenting(true);
    }
  };

  if (previewSlug) {
    return (
      <div className={`nxPres ${className ?? ""}`} {...rest}>
        <div className="nxPresPreviewBanner">
          Previewing the shared-link viewer — analytics events are LIVE and fold into this deck.
          <button type="button" className="nxPresBtn" onClick={() => setPreviewSlug(null)}>
            Back to editor
          </button>
        </div>
        <PresentationViewer
          deck={deck}
          slug={previewSlug}
          onEvent={(ev) => {
            config?.onAnalyticsEvent?.(ev);
            // fold into the snapshot through the same pure helper the host uses
            setDeck((d) => {
              const next = applyViewEvent(d, ev);
              onChangeRef.current?.(next);
              return next;
            });
          }}
        />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div ref={surfaceRef} className={`nxPres nxPresTheme-${deck.theme} ${className ?? ""}`} onKeyDown={onSurfaceKey} tabIndex={-1} {...rest}>
      {/* ---- ONE header: identity + sections + deck actions ----
           Slide-level and selection-level controls do NOT live here; they are
           contextual to the canvas below, so the surface opens with a single
           bar like every other view in the app. */}
      <header className="nxPresTop">
        <input
          className="nxPresDeckTitle"
          value={deck.title}
          onChange={(e) => commit({ ...deck, title: e.target.value }, "deck-title")}
          aria-label="Deck title"
        />

        <SectionTabs
          value={tab}
          onPick={setTab}
          tabs={
            [
              { value: "slides" as Tab, label: "Slides", icon: <PresentationIcon size={13} /> },
              feat.share ? { value: "share" as Tab, label: "Share", icon: <Share2 size={13} /> } : null,
              feat.analytics ? { value: "analytics" as Tab, label: "Analytics", icon: <ChartNoAxesColumn size={13} /> } : null,
              feat.rooms ? { value: "rooms" as Tab, label: "Rooms", icon: <LayoutTemplate size={13} /> } : null,
            ].filter(Boolean) as Array<{ value: Tab; label: string; icon: React.ReactNode }>
          }
        />

        <div className="nxPresTopSpacer" />

        {tab === "slides" && (
          <>
            <IconAction icon={<Undo2 size={13} />} label="Undo" shortcut="⌘Z" onClick={undo} disabled={!canUndo} testid="undo-btn" />
            <IconAction icon={<Redo2 size={13} />} label="Redo" shortcut="⌘⇧Z" onClick={redo} disabled={!canRedo} testid="redo-btn" />
            <span className="nxPresTopDivide" />
            <InsertMenu
              onInsertText={() => insertElement(() => addElement(slide, createTextBox()))}
              onInsertShape={(k) => insertElement(() => addElement(slide, createShape(k)))}
              onInsertImage={() => pickImage("element")}
              onInsertChart={(t) => insertElement(() => addElement(slide, createChart(t)))}
              onInsertTable={() => insertElement(() => addElement(slide, createTable()))}
              onInsertVideo={(src) => insertElement(() => addElement(slide, createVideo(src)))}
            />
            <SlideMenu
              slide={slide}
              onLayout={(l) => patchSlide(slide.id, { layout: l })}
              onTransition={(t) => patchSlide(slide.id, { transition: t })}
              notesOpen={notesOpen}
              onNotes={() => setNotesOpen((v) => !v)}
              onSaveTemplate={saveTemplate}
              masterOpen={masterOpen}
              onMaster={() => setMasterOpen((v) => !v)}
            />
          </>
        )}

        <PickerMenu
          value={deck.theme}
          options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
          onPick={(v) => commit({ ...deck, theme: v }, "deck-theme")}
          label="Theme"
          icon={<Palette size={13} />}
          testid="theme-menu"
          align="end"
        />

        <FileMenu
          canImport={!!feat.pptxImport}
          canPdf={!!feat.pdfExport}
          canPptx={!!feat.pptxExport}
          busy={busyExport}
          onImport={() => pptxRef.current?.click()}
          onPdf={doPdf}
          onPptx={doPptx}
        />

        {feat.present && (
          <TextAction variant="primary" icon={<Play size={13} />} onClick={() => setPresenting(true)} testid="present-btn" title="Present (⌘↵)">
            Present
          </TextAction>
        )}
        {actions && <div className="nxPresHostActions">{actions}</div>}
      </header>

      {tab === "slides" && (
        <div className={`nxPresEditor${notesOpen ? " hasNotes" : ""}`}>
          {/* ---- filmstrip ---- */}
          <aside className="nxPresFilm" aria-label="Slides">
            <div className="nxPresFilmList" role="listbox" aria-label="Slides">
            {deck.slides.map((s, i) => (
              <div
                key={s.id}
                className={`nxPresFilmItem${i === selIdx ? " isActive" : ""}${dropIdx === i ? " isDrop" : ""}`}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropIdx(i);
                }}
                onDragLeave={() => setDropIdx((d) => (d === i ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx != null) moveSlide(dragIdx, i);
                  setDragIdx(null);
                  setDropIdx(null);
                }}
                onClick={() => {
                  setSel(i);
                  setSelEls([]);
                }}
                tabIndex={0}
                role="option"
                aria-selected={i === selIdx}
                aria-label={`Slide ${i + 1}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSel(i);
                }}
              >
                <span className="nxPresFilmIdx">{i + 1}</span>
                <div className="nxPresFilmThumb" aria-label={`Slide ${i + 1}: ${textOf(s.blocks.title) || s.layout}`}>
                  <FitSlide className="nxPresFilmFit">
                    <SlideView slide={s} master={deck.master} slideNum={i + 1} />
                  </FitSlide>
                </div>
                <div className="nxPresFilmOps" onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" className="nxPresMicroBtn" title="Move up" aria-label="Move slide up" onClick={(e) => { e.stopPropagation(); moveSlide(i, i - 1); }} disabled={i === 0}>
                    <ChevronUp size={13} />
                  </button>
                  <button type="button" className="nxPresMicroBtn" title="Move down" aria-label="Move slide down" onClick={(e) => { e.stopPropagation(); moveSlide(i, i + 1); }} disabled={i === deck.slides.length - 1}>
                    <ChevronDown size={13} />
                  </button>
                  <button type="button" className="nxPresMicroBtn" title="Duplicate" aria-label="Duplicate slide" onClick={(e) => { e.stopPropagation(); duplicateSlide(i); }}>
                    <Copy size={13} />
                  </button>
                  <button type="button" className="nxPresMicroBtn nxPresMicroDanger" title="Delete" aria-label="Delete slide" onClick={(e) => { e.stopPropagation(); deleteSlide(i); }} disabled={deck.slides.length <= 1}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            </div>
            <div className="nxPresFilmAdd">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary" icon={<Plus size={13} />} data-testid="add-slide-menu">
                    New slide
                  </Button>
                </DropdownMenuTrigger>
                {/* the trigger is pinned to the bottom of a scrolling filmstrip, so the
                    menu opens upward — collision detection against the scroll
                    container would otherwise push it off-screen */}
                <DropdownMenuContent align="start" side="top" sideOffset={6}>
                  <DropdownMenuLabel>Layout</DropdownMenuLabel>
                  {(Object.keys(LAYOUTS) as SlideLayout[]).map((l) => (
                    <DropdownMenuCheckboxItem key={l} checked={false} onCheckedChange={() => addSlide(l)} data-testid={`add-${l}`}>
                      {LAYOUTS[l].label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {(deck.templates?.length ?? 0) > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Your templates</DropdownMenuLabel>
                      {deck.templates!.map((t) => (
                        <DropdownMenuCheckboxItem
                          key={t.id}
                          checked={false}
                          onCheckedChange={() => insertTemplate(t)}
                          data-testid={`add-tpl-${t.id}`}
                        >
                          {t.name}
                          <button
                            type="button"
                            className="nxPresTplRemove"
                            aria-label={`Delete template ${t.name}`}
                            onPointerDown={(e) => {
                              /* pointerdown: fire before the menu item's own select closes the menu */
                              e.preventDefault();
                              e.stopPropagation();
                              removeTemplate(t.id);
                            }}
                          >
                            ✕
                          </button>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </aside>

          {/* ---- canvas column ---- */}
          <div className="nxPresMain">
            {/* contextual: text formatting appears only while a text region or
                text box has focus — it belongs to what you are editing, not to
                the surface as a whole */}
            {textFocus && selEls.length === 0 && (
              <div className="nxPresContextBar" role="toolbar" aria-label="Text formatting" data-testid="text-format-bar">
                <IconAction icon={<Bold size={13} />} label="Bold" shortcut="⌘B" onClick={() => fmt("bold")} testid="fmt-bold" />
                <IconAction icon={<Italic size={13} />} label="Italic" shortcut="⌘I" onClick={() => fmt("italic")} testid="fmt-italic" />
                <IconAction icon={<Underline size={13} />} label="Underline" shortcut="⌘U" onClick={() => fmt("underline")} testid="fmt-underline" />
                <span className="nxPresTopDivide" />
                <IconAction icon={<List size={13} />} label="Bulleted list" onClick={() => fmt("insertUnorderedList")} testid="fmt-ul" />
                <IconAction icon={<ListOrdered size={13} />} label="Numbered list" onClick={() => fmt("insertOrderedList")} testid="fmt-ol" />
              </div>
            )}

            <ElementBar slide={slide} selected={selEls} onSlide={(nx) => putSlide(nx, "commit")} onSelect={setSelEls} />

            <div
              className="nxPresCanvasWell"
              onFocusCapture={(e) => {
                const t = e.target as HTMLElement;
                setTextFocus(!!t.closest('[contenteditable="true"]'));
              }}
              onBlurCapture={(e) => {
                const next = e.relatedTarget as HTMLElement | null;
                if (!next || !next.closest('[contenteditable="true"], .nxPresContextBar')) setTextFocus(false);
              }}
            >
              <FitSlide className="nxPresCanvas">
                <SlideView
                  slide={slide}
                  master={deck.master}
                  slideNum={selIdx + 1}
                  editable
                  onBlockChange={setBlock}
                  onImagePick={() => pickImage("region")}
                  onRegionFocus={() => setTextFocus(true)}
                  elementLayer={
                    <ElementLayer
                      slide={slide}
                      editable
                      selected={selEls}
                      onSelect={setSelEls}
                      onDraft={(nx) => putSlide(nx, "draft")}
                      onCommit={(nx) => putSlide(nx, "commit")}
                    />
                  }
                />
              </FitSlide>
            </div>

            {/* notes FLOAT over the canvas (user-arbitrated: the under-stage band
                cost stage height twice) — closed by default so the stage opens clean */}
            {notesOpen && (
              <div className="nxPresNotes" data-testid="notes-panel">
                <span className="nxPresNotesLabel">Speaker notes</span>
                <textarea
                  className="nxPresNotesArea"
                  value={slide.notes}
                  placeholder="Notes only you see in presenter view…"
                  onChange={(e) => patchSlide(slide.id, { notes: e.target.value })}
                  aria-label="Speaker notes"
                />
              </div>
            )}

            {masterOpen && (
              <div className="nxPresMasterPanel" data-testid="master-panel">
                <div className="nxPresMasterPanelHead">
                  <span className="nxPresNotesLabel">Deck master</span>
                  <button type="button" className="nxPresBtn" onClick={() => setMasterOpen(false)} data-testid="master-close">
                    Done
                  </button>
                </div>
                <div className="nxPresMasterRow">
                  <PickerMenu
                    value={masterFontValue(deck.master?.fonts?.heading)}
                    options={MASTER_FONT_OPTIONS}
                    onPick={(v) => setMaster({ fonts: { ...deck.master?.fonts, heading: v === "theme" ? undefined : FONT_STACKS[v] } })}
                    label="Heading font"
                    testid="master-font-h"
                  />
                  <PickerMenu
                    value={masterFontValue(deck.master?.fonts?.body)}
                    options={MASTER_FONT_OPTIONS}
                    onPick={(v) => setMaster({ fonts: { ...deck.master?.fonts, body: v === "theme" ? undefined : FONT_STACKS[v] } })}
                    label="Body font"
                    testid="master-font-b"
                  />
                </div>
                <div className="nxPresMasterRow">
                  <ColorWell label="Background" value={deck.master?.colors?.bg ?? "none"} onPick={(v) => setMaster({ colors: { ...deck.master?.colors, bg: v === "none" ? undefined : v } })} testid="master-bg" />
                  <ColorWell label="Accent" value={deck.master?.colors?.accent ?? "none"} onPick={(v) => setMaster({ colors: { ...deck.master?.colors, accent: v === "none" ? undefined : v } })} testid="master-accent" />
                </div>
                <div className="nxPresMasterRow">
                  {deck.master?.logo?.src ? (
                    <>
                      <img className="nxPresMasterLogoPreview" src={deck.master.logo.src} alt="Logo preview" />
                      <PickerMenu
                        value={deck.master.logo.pos}
                        options={[
                          { value: "tl", label: "Top left" },
                          { value: "tr", label: "Top right" },
                          { value: "bl", label: "Bottom left" },
                          { value: "br", label: "Bottom right" },
                        ]}
                        onPick={(pos) => setMaster({ logo: { ...deck.master!.logo!, pos } })}
                        label="Logo position"
                        testid="master-logo-pos"
                      />
                      <Button size="sm" variant="ghost" onClick={() => setMaster({ logo: undefined })} data-testid="master-logo-remove">
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => pickImage("logo")} data-testid="master-logo-add">
                      Add logo…
                    </Button>
                  )}
                </div>
                <div className="nxPresMasterRow">
                  <input
                    className="nxPresVideoInput"
                    placeholder="Footer text (every slide)"
                    value={deck.master?.footer?.text ?? ""}
                    onChange={(e) => setMasterFooter({ text: e.target.value || undefined })}
                    aria-label="Footer text"
                    data-testid="master-footer-text"
                  />
                  <label className="nxPresCheck">
                    <input
                      type="checkbox"
                      checked={!!deck.master?.footer?.showSlideNum}
                      onChange={(e) => setMasterFooter({ showSlideNum: e.target.checked })}
                      data-testid="master-slidenum"
                    />
                    Slide №
                  </label>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {tab === "share" && <SharePanel deck={deck} onChange={(d) => commit(d, "share-panel")} config={config} onOpenViewer={setPreviewSlug} />}
      {tab === "analytics" && <AnalyticsPanel deck={deck} />}
      {tab === "rooms" && <RoomsPanel deck={deck} onChange={(d) => commit(d, "rooms-panel")} />}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onImageFile(e.target.files?.[0])} />
      <input
        ref={pptxRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={(e) => onPptxFile(e.target.files?.[0])}
        data-testid="pptx-input"
      />

      {importReport && (
        <div className="nxPresImportReport" role="status" data-testid="import-report">
          <div className="nxPresImportHead">
            <strong>
              {importReport.n ? `Imported ${importReport.n} slide${importReport.n === 1 ? "" : "s"}` : "Nothing imported"}
            </strong>
            <button type="button" className="nxPresBtn" onClick={() => setImportReport(null)} data-testid="import-report-close">
              Close
            </button>
          </div>
          {importReport.warnings.length > 0 && (
            <>
              <span className="nxPresImportSub">What did not come across:</span>
              <ul className="nxPresImportList">
                {importReport.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {presenting && <PresentMode deck={deck} startIndex={selIdx} onExit={() => setPresenting(false)} />}
    </div>
    </TooltipProvider>
  );
}

/* Slide-level properties (layout · transition · notes) as ONE menu, so the
   surface needs no third toolbar row. */
function SlideMenu({
  slide,
  onLayout,
  onTransition,
  notesOpen,
  onNotes,
  onSaveTemplate,
  masterOpen,
  onMaster,
}: {
  slide: Slide;
  onLayout: (l: SlideLayout) => void;
  onTransition: (t: SlideTransition) => void;
  notesOpen: boolean;
  onNotes: () => void;
  onSaveTemplate: () => void;
  masterOpen: boolean;
  onMaster: () => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" icon={<LayoutTemplate size={13} />} data-testid="slide-menu">
          Slide
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        {(Object.keys(LAYOUTS) as SlideLayout[]).map((l) => (
          <DropdownMenuCheckboxItem
            key={l}
            checked={slide.layout === l}
            onCheckedChange={() => onLayout(l)}
            data-testid={`layout-${l}`}
          >
            {LAYOUTS[l].label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Transition</DropdownMenuLabel>
        {TRANSITIONS.map((t) => (
          <DropdownMenuCheckboxItem
            key={t}
            checked={(slide.transition ?? "fade") === t}
            onCheckedChange={() => onTransition(t)}
            data-testid={`transition-${t}`}
          >
            {t === "none" ? "None" : t[0].toUpperCase() + t.slice(1)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={notesOpen} onCheckedChange={onNotes} data-testid="notes-toggle">
          Speaker notes
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={false} onCheckedChange={onSaveTemplate} data-testid="save-template">
          Save as template
          <span className="nxPresMenuHint">reusable slide</span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={masterOpen} onCheckedChange={onMaster} data-testid="master-toggle">
          Deck master…
          <span className="nxPresMenuHint">fonts · logo · footer</span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* Import + both exports under one File menu — three competing button idioms in
   the header was the widget tell. */
function FileMenu({
  canImport,
  canPdf,
  canPptx,
  busy,
  onImport,
  onPdf,
  onPptx,
}: {
  canImport: boolean;
  canPdf: boolean;
  canPptx: boolean;
  busy: null | "pptx" | "import";
  onImport: () => void;
  onPdf: () => void;
  onPptx: () => void;
}) {
  if (!canImport && !canPdf && !canPptx) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" icon={<FileDown size={13} />} busy={!!busy} data-testid="file-menu">
          File
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canImport && (
          <DropdownMenuCheckboxItem checked={false} onCheckedChange={onImport} data-testid="import-pptx">
            <span className="nxPresMenuIcon"><Upload size={13} /></span>
            Import .pptx
            <span className="nxPresMenuHint">PowerPoint · Slides</span>
          </DropdownMenuCheckboxItem>
        )}
        {(canPdf || canPptx) && canImport && <DropdownMenuSeparator />}
        {canPdf && (
          <DropdownMenuCheckboxItem checked={false} onCheckedChange={onPdf} data-testid="pdf-export">
            <span className="nxPresMenuIcon"><Download size={13} /></span>
            Export PDF
          </DropdownMenuCheckboxItem>
        )}
        {canPptx && (
          <DropdownMenuCheckboxItem checked={false} onCheckedChange={onPptx} data-testid="pptx-export">
            <span className="nxPresMenuIcon"><Download size={13} /></span>
            Export .pptx
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PresentationSurface;
