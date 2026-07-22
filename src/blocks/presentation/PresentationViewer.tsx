import * as React from "react";
import type { DeckSnapshot, ShareLink, ViewEvent } from "./types";
import { uid } from "./types";
import { SlideView } from "./SlideView";
import { FitSlide } from "./PresentMode";

export interface PresentationViewerProps {
  deck: DeckSnapshot;
  /* the share slug the viewer arrived on; resolves access rules from deck.sharing */
  slug: string;
  /* ANALYTICS SEAM — every view event lands here; the host folds it into the
     snapshot via applyViewEvent (and/or forwards to a backend). */
  onEvent?: (event: ViewEvent) => void;
  className?: string;
}

/* Read-only shared-deck route (the papermark layer's viewer): resolves the link,
   enforces expiry/disabled, optionally gates on email, then plays the deck with
   per-slide time tracking (visible time only; tab-hidden time is not counted). */
export function PresentationViewer({ deck, slug, onEvent, className }: PresentationViewerProps) {
  const link = deck.sharing.links.find((l) => l.slug === slug);
  const [email, setEmail] = React.useState("");
  const [admitted, setAdmitted] = React.useState<null | { email?: string }>(null);

  const state: "missing" | "disabled" | "expired" | "gate" | "open" = !link
    ? "missing"
    : link.disabled
      ? "disabled"
      : link.expiresAt && Date.now() > Date.parse(link.expiresAt)
        ? "expired"
        : !admitted && link.emailGate
          ? "gate"
          : "open";

  if (state !== "open") {
    return (
      <div className={`nxPresViewerShell ${className ?? ""}`} data-testid="viewer-gate">
        <div className="nxPresGateCard">
          <div className="nxPresGateTitle">{deck.title}</div>
          {state === "missing" && <p className="nxPresGateMsg">This link doesn't exist.</p>}
          {state === "disabled" && <p className="nxPresGateMsg">This link has been turned off by the owner.</p>}
          {state === "expired" && <p className="nxPresGateMsg">This link has expired.</p>}
          {state === "gate" && (
            <form
              className="nxPresGateForm"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) setAdmitted({ email });
              }}
            >
              <p className="nxPresGateMsg">Enter your email to view this presentation.</p>
              <input
                className="nxPresGateInput"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Your email"
              />
              <button type="submit" className="nxPresBtn nxPresBtnPrimary">
                View presentation
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return <ViewerPlayer deck={deck} link={link!} viewerEmail={admitted?.email} onEvent={onEvent} className={className} />;
}

function ViewerPlayer({
  deck,
  link,
  viewerEmail,
  onEvent,
  className,
}: {
  deck: DeckSnapshot;
  link: ShareLink;
  viewerEmail?: string;
  onEvent?: (e: ViewEvent) => void;
  className?: string;
}) {
  const [index, setIndex] = React.useState(0);
  const sessionId = React.useRef(`vs-${uid()}`);
  const emit = React.useRef(onEvent);
  emit.current = onEvent;
  const total = deck.slides.length;

  React.useEffect(() => {
    emit.current?.({
      type: "session_start",
      sessionId: sessionId.current,
      linkId: link.id,
      viewerEmail,
      at: new Date().toISOString(),
    });
    // session id + link id are stable for the mount — start exactly once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* per-slide visible-time meter: accumulate while the tab is visible, flush on
     slide change / hide / unmount */
  React.useEffect(() => {
    const slide = deck.slides[index];
    if (!slide) return;
    let shownAt = document.visibilityState === "visible" ? performance.now() : null;
    const flush = () => {
      if (shownAt == null) return;
      const ms = Math.round(performance.now() - shownAt);
      shownAt = null;
      if (ms > 150)
        emit.current?.({ type: "slide_time", sessionId: sessionId.current, slideId: slide.id, ms, slideIndex: index });
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
      else shownAt = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [index, deck.slides]);

  React.useEffect(() => {
    if (index === total - 1) emit.current?.({ type: "session_complete", sessionId: sessionId.current });
  }, [index, total]);

  const go = (d: number) => setIndex((i) => Math.max(0, Math.min(total - 1, i + d)));

  return (
    <div
      className={`nxPresViewerShell nxPresTheme-${deck.theme} ${className ?? ""}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
          e.preventDefault();
          go(1);
        }
        if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          go(-1);
        }
      }}
      data-testid="viewer-player"
    >
      <header className="nxPresViewerHead">
        <span className="nxPresViewerTitle">{deck.title}</span>
        <span className="nxPresViewerMeta">{link.label || "Shared presentation"}</span>
      </header>
      <div className="nxPresViewerStage" onClick={() => go(1)}>
        <FitSlide className="nxPresAnimate">
          <SlideView key={deck.slides[index].id} slide={deck.slides[index]} master={deck.master} slideNum={index + 1} />
        </FitSlide>
      </div>
      <footer className="nxPresViewerBar">
        <button type="button" className="nxPresGhostBtn" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous slide">
          ←
        </button>
        <div className="nxPresViewerProgress" aria-hidden>
          {deck.slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`nxPresViewerDot${i === index ? " isActive" : ""}${i < index ? " isSeen" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
        <span className="nxPresPresentCount">
          {index + 1} / {total}
        </span>
        <button type="button" className="nxPresGhostBtn" onClick={() => go(1)} disabled={index === total - 1} aria-label="Next slide">
          →
        </button>
      </footer>
    </div>
  );
}
