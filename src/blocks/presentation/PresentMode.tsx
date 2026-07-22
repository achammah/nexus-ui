import * as React from "react";
import type { DeckSnapshot } from "./types";
import { SlideView, textOf } from "./SlideView";

export interface PresentModeProps {
  deck: DeckSnapshot;
  startIndex?: number;
  onExit: () => void;
  /* fires whenever the visible slide changes (present-analytics ride the same hook) */
  onSlideShown?: (index: number) => void;
}

/* Fullscreen presentation: arrows/space/PageUp-Down navigate, Esc exits, P toggles
   the presenter strip (speaker notes + next-slide preview + clock), N/→ advance.
   Transitions come from each slide's `transition` (CSS-driven). */
export function PresentMode({ deck, startIndex = 0, onExit, onSlideShown }: PresentModeProps) {
  const [index, setIndex] = React.useState(Math.min(startIndex, deck.slides.length - 1));
  const [presenter, setPresenter] = React.useState(false);
  const [anim, setAnim] = React.useState(0); // bumps to retrigger the enter animation
  const rootRef = React.useRef<HTMLDivElement>(null);
  const total = deck.slides.length;

  const go = React.useCallback(
    (delta: number) => {
      setIndex((i) => {
        const n = Math.max(0, Math.min(total - 1, i + delta));
        if (n !== i) setAnim((a) => a + 1);
        return n;
      });
    },
    [total],
  );

  React.useEffect(() => onSlideShown?.(index), [index, onSlideShown]);

  // real fullscreen where available; the fixed overlay is the functional fallback
  React.useEffect(() => {
    const el = rootRef.current;
    el?.requestFullscreen?.().catch(() => undefined);
    el?.focus();
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
      case "n":
        e.preventDefault();
        go(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        go(-1);
        break;
      case "Home":
        setIndex(0);
        break;
      case "End":
        setIndex(total - 1);
        break;
      case "p":
      case "P":
        setPresenter((v) => !v);
        break;
      case "Escape":
        e.preventDefault();
        onExit();
        break;
    }
  };

  const slide = deck.slides[index];
  const next = deck.slides[index + 1];

  return (
    <div
      ref={rootRef}
      className={`nxPresPresent nxPresTheme-${deck.theme}${presenter ? " hasPresenter" : ""}`}
      role="application"
      aria-label={`Presenting ${deck.title}, slide ${index + 1} of ${total}`}
      tabIndex={-1}
      onKeyDown={onKey}
      data-testid="present-mode"
    >
      <div className="nxPresStage" onClick={() => go(1)}>
        <div key={`${slide.id}:${anim}`} className={`nxPresStageSlide nxPresAnimate nxPresEnter-${slide.transition ?? "fade"}`}>
          <FitSlide>
            <SlideView slide={slide} master={deck.master} slideNum={index + 1} />
          </FitSlide>
        </div>
      </div>

      {presenter && (
        <aside className="nxPresPresenter">
          <div className="nxPresPresenterClock">
            <Clock /> · Slide {index + 1}/{total}
          </div>
          <div className="nxPresPresenterNotes">{slide.notes || "No speaker notes for this slide."}</div>
          {next ? (
            <div className="nxPresPresenterNext">
              <span className="nxPresPresenterNextLabel">Next</span>
              <span className="nxPresPresenterNextTitle">{textOf(next.blocks.title) || textOf(next.blocks.quote) || `Slide ${index + 2}`}</span>
            </div>
          ) : (
            <div className="nxPresPresenterNext"><span className="nxPresPresenterNextLabel">Last slide</span></div>
          )}
        </aside>
      )}

      <footer className="nxPresPresentBar">
        <button type="button" className="nxPresGhostBtn" onClick={onExit} aria-label="Exit presentation (Esc)">
          Esc
        </button>
        <span className="nxPresPresentCount">
          {index + 1} / {total}
        </span>
        <button type="button" className="nxPresGhostBtn" onClick={() => setPresenter((v) => !v)} aria-pressed={presenter}>
          Notes (P)
        </button>
        <button type="button" className="nxPresGhostBtn" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous slide">
          ←
        </button>
        <button type="button" className="nxPresGhostBtn" onClick={() => go(1)} disabled={index === total - 1} aria-label="Next slide">
          →
        </button>
      </footer>
    </div>
  );
}

/* Scales its 1280x720 child to fit the available box (transform keeps text crisp
   relative to layout math; same trick the filmstrip uses at thumbnail size).
   The outer flexbox centers a WRAPPER cut to the exact scaled size, and the
   design box scales from origin 0 0 inside it — fully deterministic (no CSS
   translate/transform ordering involved). */
export function FitSlide({ children, className }: { children: React.ReactNode; className?: string }) {
  const outer = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.1);
  React.useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setScale(Math.max(0.01, Math.min(r.width / 1280, r.height / 720)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className={`nxPresFit ${className ?? ""}`}>
      <div className="nxPresFitClip" style={{ width: 1280 * scale, height: 720 * scale }}>
        <div className="nxPresFitInner" style={{ transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>;
}
