import * as React from "react";
import type { DeckSnapshot, DeckThemeId, PresentationConfig, Slide, SlideBlocks, SlideLayout, SlideTransition } from "./types";
import { uid } from "./types";
import { applyViewEvent, createSlide, isDeckSnapshot, seedDeck } from "./snapshot";
import { LAYOUTS, SlideView, textOf } from "./SlideView";
import { ElementLayer } from "./ElementLayer";
import { ElementBar, InsertBar } from "./ElementControls";
import {
  addElement,
  createImageElement,
  createShape,
  createTextBox,
  duplicateElements,
  els,
  removeElements,
} from "./elements";
import { FitSlide, PresentMode } from "./PresentMode";
import { AnalyticsPanel, RoomsPanel, SharePanel } from "./SharePanels";
import { PresentationViewer } from "./PresentationViewer";
import { exportDeckToPdf, exportDeckToPptx } from "./export";
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
    pdfExport: true,
    present: true,
    ...config?.features,
  };

  /* adopt value on mount + on reloadNonce; edits flow deck -> onChange upward */
  const [deck, setDeck] = React.useState<DeckSnapshot>(() => (isDeckSnapshot(value) ? value : seedDeck()));
  React.useEffect(() => {
    setDeck(isDeckSnapshot(value) ? value : seedDeck());
    // adopt exactly when the host asks (initial value is captured by useState)
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
  const [notesOpen, setNotesOpen] = React.useState(true);
  const [presenting, setPresenting] = React.useState(false);
  const [previewSlug, setPreviewSlug] = React.useState<string | null>(null);
  const [busyExport, setBusyExport] = React.useState<null | "pptx">(null);
  const [selEls, setSelEls] = React.useState<string[]>([]);
  /* what an image pick should do: replace the layout's image region, or insert an element */
  const imageIntent = React.useRef<"region" | "element">("region");
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

  const pickImage = (intent: "region" | "element" = "region") => {
    imageIntent.current = intent;
    fileRef.current?.click();
  };
  const onImageFile = (f: File | undefined) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result);
      if (imageIntent.current === "element") insertElement(() => addElement(slide, createImageElement(src)));
      else setBlock("imageUrl", src);
    };
    fr.readAsDataURL(f);
  };

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
    <div ref={surfaceRef} className={`nxPres nxPresTheme-${deck.theme} ${className ?? ""}`} onKeyDown={onSurfaceKey} tabIndex={-1} {...rest}>
      {/* ---- top bar ---- */}
      <header className="nxPresTop">
        <input
          className="nxPresDeckTitle"
          value={deck.title}
          onChange={(e) => commit({ ...deck, title: e.target.value }, "deck-title")}
          aria-label="Deck title"
        />
        <nav className="nxPresTabs" role="tablist" aria-label="Presentation sections">
          {(
            [
              ["slides", "Slides", true],
              ["share", "Share", feat.share],
              ["analytics", "Analytics", feat.analytics],
              ["rooms", "Rooms", feat.rooms],
            ] as Array<[Tab, string, boolean]>
          )
            .filter(([, , on]) => on)
            .map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`nxPresTab${tab === t ? " isActive" : ""}`} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
        </nav>
        <div className="nxPresTopSpacer" />
        <select
          className="nxPresSelect"
          value={deck.theme}
          onChange={(e) => commit({ ...deck, theme: e.target.value as DeckThemeId }, "deck-theme")}
          aria-label="Deck theme"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {feat.pdfExport && (
          <button type="button" className="nxPresBtn" onClick={doPdf} title="Print / save as PDF">
            PDF
          </button>
        )}
        {feat.pptxExport && (
          <button type="button" className="nxPresBtn" onClick={doPptx} disabled={busyExport === "pptx"}>
            {busyExport === "pptx" ? "Exporting…" : "PPTX"}
          </button>
        )}
        {feat.present && (
          <button type="button" className="nxPresBtn nxPresBtnPrimary" onClick={() => setPresenting(true)} data-testid="present-btn">
            Present
          </button>
        )}
        {actions && <div className="nxPresHostActions">{actions}</div>}
      </header>

      {tab === "slides" && (
        <div className={`nxPresEditor${notesOpen ? " hasNotes" : ""}`}>
          {/* ---- filmstrip ---- */}
          <aside className="nxPresFilm" role="listbox" aria-label="Slides">
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
                    <SlideView slide={s} />
                  </FitSlide>
                </div>
                <div className="nxPresFilmOps">
                  <button type="button" className="nxPresMicroBtn" title="Move up" aria-label="Move slide up" onClick={(e) => { e.stopPropagation(); moveSlide(i, i - 1); }} disabled={i === 0}>↑</button>
                  <button type="button" className="nxPresMicroBtn" title="Move down" aria-label="Move slide down" onClick={(e) => { e.stopPropagation(); moveSlide(i, i + 1); }} disabled={i === deck.slides.length - 1}>↓</button>
                  <button type="button" className="nxPresMicroBtn" title="Duplicate" aria-label="Duplicate slide" onClick={(e) => { e.stopPropagation(); duplicateSlide(i); }}>⧉</button>
                  <button type="button" className="nxPresMicroBtn" title="Delete" aria-label="Delete slide" onClick={(e) => { e.stopPropagation(); deleteSlide(i); }} disabled={deck.slides.length <= 1}>✕</button>
                </div>
              </div>
            ))}
            <div className="nxPresFilmAdd">
              <span className="nxPresFilmAddLabel">New slide</span>
              <div className="nxPresFilmAddGrid">
                {(Object.keys(LAYOUTS) as SlideLayout[]).map((l) => (
                  <button key={l} type="button" className="nxPresBtn nxPresLayoutBtn" onClick={() => addSlide(l)} data-testid={`add-${l}`}>
                    {LAYOUTS[l].label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* ---- canvas column ---- */}
          <div className="nxPresMain">
            <div className="nxPresToolbar" role="toolbar" aria-label="Slide formatting">
              <div className="nxPresToolGroup">
                <button type="button" className="nxPresToolBtn" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo" data-testid="undo-btn">↩</button>
                <button type="button" className="nxPresToolBtn" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)" aria-label="Redo" data-testid="redo-btn">↪</button>
              </div>
              <div className="nxPresToolGroup">
                <button type="button" className="nxPresToolBtn" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt("bold")} title="Bold (⌘B)"><b>B</b></button>
                <button type="button" className="nxPresToolBtn" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt("italic")} title="Italic (⌘I)"><i>I</i></button>
                <button type="button" className="nxPresToolBtn" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt("underline")} title="Underline (⌘U)"><u>U</u></button>
                <button type="button" className="nxPresToolBtn" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt("insertUnorderedList")} title="Bulleted list">• list</button>
                <button type="button" className="nxPresToolBtn" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt("insertOrderedList")} title="Numbered list">1. list</button>
              </div>
              <div className="nxPresToolGroup">
                <label className="nxPresToolLabel">
                  Layout
                  <select className="nxPresSelect" value={slide.layout} onChange={(e) => patchSlide(slide.id, { layout: e.target.value as SlideLayout })} aria-label="Slide layout">
                    {(Object.keys(LAYOUTS) as SlideLayout[]).map((l) => (
                      <option key={l} value={l}>
                        {LAYOUTS[l].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="nxPresToolLabel">
                  Transition
                  <select className="nxPresSelect" value={slide.transition ?? "fade"} onChange={(e) => patchSlide(slide.id, { transition: e.target.value as SlideTransition })} aria-label="Slide transition">
                    {TRANSITIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <InsertBar
                onInsertText={() => insertElement(() => addElement(slide, createTextBox()))}
                onInsertShape={(k) => insertElement(() => addElement(slide, createShape(k)))}
                onInsertImage={() => pickImage("element")}
              />
              <div className="nxPresToolGroup">
                <button type="button" className={`nxPresToolBtn${notesOpen ? " isOn" : ""}`} onClick={() => setNotesOpen((v) => !v)} aria-pressed={notesOpen}>
                  Notes
                </button>
              </div>
            </div>

            <ElementBar slide={slide} selected={selEls} onSlide={(nx) => putSlide(nx, "commit")} onSelect={setSelEls} />

            <div className="nxPresCanvasWell">
              <FitSlide className="nxPresCanvas">
                <SlideView
                  slide={slide}
                  editable
                  onBlockChange={setBlock}
                  onImagePick={() => pickImage("region")}
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

            {notesOpen && (
              <div className="nxPresNotes">
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
          </div>
        </div>
      )}

      {tab === "share" && <SharePanel deck={deck} onChange={(d) => commit(d, "share-panel")} config={config} onOpenViewer={setPreviewSlug} />}
      {tab === "analytics" && <AnalyticsPanel deck={deck} />}
      {tab === "rooms" && <RoomsPanel deck={deck} onChange={(d) => commit(d, "rooms-panel")} />}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onImageFile(e.target.files?.[0])} />

      {presenting && <PresentMode deck={deck} startIndex={selIdx} onExit={() => setPresenting(false)} />}
    </div>
  );
}

export default PresentationSurface;
