/* Presentation block — data model. The whole deck (slides, theme, sharing links,
   view analytics, data-room grouping) persists as ONE snapshot blob under a
   namespaced store key, mirroring the workbook block's free-surface contract. */

export type SlideLayout =
  | "title"
  | "title-body"
  | "two-column"
  | "image"
  | "quote"
  | "section"
  | "blank";

export type SlideTransition = "none" | "fade" | "slide" | "zoom";

/* Rich-text blocks store sanitized HTML strings (bold/italic/underline/lists
   produced by the in-canvas editor). Plain strings render as-is. */
export interface SlideBlocks {
  title?: string;
  subtitle?: string;
  body?: string;
  left?: string;
  right?: string;
  imageUrl?: string;
  caption?: string;
  quote?: string;
  attribution?: string;
}

export interface Slide {
  id: string;
  layout: SlideLayout;
  blocks: SlideBlocks;
  /* speaker notes — plain text, shown in presenter view + notes drawer */
  notes: string;
  transition?: SlideTransition;
}

export type DeckThemeId = "native" | "paper" | "midnight" | "accent" | "gradient";

/* ---- papermark layer (share + track) ---- */

export interface ShareLink {
  id: string;
  /* url-safe slug — the host maps it to a viewer route (see PresentationConfig.buildShareUrl) */
  slug: string;
  label?: string;
  createdAt: string;
  /* ISO date; viewer refuses entry after this */
  expiresAt?: string | null;
  /* when true the viewer collects an email before showing the deck */
  emailGate?: boolean;
  disabled?: boolean;
}

/* One viewer session: which link, who (if email-gated), ms spent per slide. */
export interface ViewSession {
  id: string;
  linkId: string;
  viewerEmail?: string;
  startedAt: string;
  /* slideId -> total visible milliseconds */
  slideMs: Record<string, number>;
  /* highest slide index reached (0-based) */
  maxSlideIndex: number;
  completed: boolean;
}

/* Analytics events the viewer emits through the data seam (host persists them
   by folding into the snapshot via applyViewEvent, or ships them to a backend). */
export type ViewEvent =
  | { type: "session_start"; sessionId: string; linkId: string; viewerEmail?: string; at: string }
  | { type: "slide_time"; sessionId: string; slideId: string; ms: number; slideIndex: number }
  | { type: "session_complete"; sessionId: string };

/* A simple data room: an ordered grouping of decks/documents shared as one set.
   Items pointing at OTHER pages live as references (title + href) because a
   snapshot only owns its own deck — cross-page resolution is the host's seam. */
export interface DataRoomItem {
  id: string;
  kind: "this-deck" | "link";
  title: string;
  /* for kind:"link" — host-resolved location of the other deck/document */
  href?: string;
}

export interface DataRoom {
  id: string;
  name: string;
  items: DataRoomItem[];
  createdAt: string;
}

/* ---- snapshot root ---- */

export interface DeckSnapshot {
  kind: "deck";
  version: 1;
  id: string;
  title: string;
  theme: DeckThemeId;
  slides: Slide[];
  sharing: { links: ShareLink[] };
  analytics: { sessions: ViewSession[] };
  rooms: DataRoom[];
}

/* ---- config surface ---- */

export interface PresentationConfig {
  /* default theme for new decks */
  defaultTheme?: DeckThemeId;
  /* feature switches — everything defaults ON */
  features?: {
    share?: boolean;
    analytics?: boolean;
    rooms?: boolean;
    pptxExport?: boolean;
    pdfExport?: boolean;
    present?: boolean;
  };
  /* host-owned mapping from a share slug to a public URL. Default builds
     `${location.origin}${location.pathname}#/share/<slug>` — a labeled seam:
     real deployments point this at their viewer route. */
  buildShareUrl?: (slug: string) => string;
  /* CONFIG SEAM — when set, viewer analytics events are ALSO forwarded here
     (e.g. to a backend); the in-snapshot fold still happens via onEvent->applyViewEvent. */
  onAnalyticsEvent?: (event: ViewEvent) => void;
}

export const uid = (): string => Math.random().toString(36).slice(2, 10);
