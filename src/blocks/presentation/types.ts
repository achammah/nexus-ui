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
  | "blank"
  /* no regions at all — pure free placement. Imported PowerPoint/Slides decks
     land here, because their content is already absolutely positioned. */
  | "canvas";

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

/* ---- free-placement elements ----
   Layout REGIONS (blocks above) are the template path: the layout decides where
   text sits. ELEMENTS are the PowerPoint path: anything, anywhere, on top. Both
   coexist on a slide — a layout gives you a fast start, elements give you full
   freedom. Coordinates are in the 1280x720 design box (see FitSlide), so a slide
   renders identically at thumbnail, canvas, present and export sizes. */

export type ShapeKind =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "arrow"
  | "line"
  | "star"
  | "callout";

export type ElementKind = "text" | "shape" | "image" | "chart" | "table" | "video";

/* Entrance animation for one element — plays when its slide ENTERS in present
   mode / the shared viewer (never while editing). Order among a slide's animated
   elements = array order; each step staggers after the previous. */
export type AnimEffect = "none" | "fade" | "rise" | "pop" | "wipe";
export interface ElementAnim {
  effect: AnimEffect;
}

export type ChartKind = "bar" | "line" | "pie" | "area" | "scatter";

/* A chart carries its own DATA — a deck is self-contained, so a slide never
   depends on a live query to render. The editable data table writes straight
   into this shape. */
export interface ChartSpec {
  type: ChartKind;
  /* one name per numeric column */
  series: string[];
  /* one row per category; `values` is parallel to `series` */
  rows: Array<{ label: string; values: number[] }>;
  showLegend?: boolean;
  showGrid?: boolean;
  /* axis labels (bar/line/area/scatter) */
  xLabel?: string;
  yLabel?: string;
}

export interface TableCell {
  text: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  bg?: string;
}

export interface TableSpec {
  /* row 0 is the header row when headerRow is true */
  rows: TableCell[][];
  headerRow?: boolean;
  /* relative column widths; defaults to equal */
  colWidths?: number[];
}

export interface ElementStyle {
  /* any CSS color, or "none" for no fill/stroke */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /* 0..1 — whole-element opacity (images, text boxes) */
  opacity?: number;
  /* 0..1 — shape FILL transparency only, leaving the label readable. This is what
     PowerPoint's shape "Transparency" actually does, so the slider maps here for
     shapes and to `opacity` for everything else. */
  fillOpacity?: number;
  /* corner radius in design px (roundRect) */
  radius?: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  /* text depth — multiplier (1.0–2.5) and px tracking; text + shape labels */
  lineHeight?: number;
  letterSpacing?: number;
}

export interface SlideElement {
  id: string;
  kind: ElementKind;
  /* top-left + size in design px */
  x: number;
  y: number;
  w: number;
  h: number;
  /* clockwise degrees about the element centre */
  rot?: number;
  locked?: boolean;
  /* members of one group share a groupId and select/move together */
  groupId?: string;
  style?: ElementStyle;
  /* kind:"shape" */
  shape?: ShapeKind;
  /* kind:"text" (sanitized rich HTML) — also the label drawn inside a shape */
  html?: string;
  /* kind:"image" — data URL or href · kind:"video" — mp4/webm URL (or data URL) */
  src?: string;
  alt?: string;
  /* kind:"video" — optional poster frame */
  poster?: string;
  /* entrance animation (present/viewer only) */
  anim?: ElementAnim;
  /* kind:"chart" */
  chart?: ChartSpec;
  /* kind:"table" */
  table?: TableSpec;
}

export interface Slide {
  id: string;
  layout: SlideLayout;
  blocks: SlideBlocks;
  /* speaker notes — plain text, shown in presenter view + notes drawer */
  notes: string;
  transition?: SlideTransition;
  /* free-placement layer, painted over the layout regions in array order (= z-order) */
  elements?: SlideElement[];
}

export type DeckThemeId = "native" | "paper" | "midnight" | "accent" | "gradient";

/* ---- slide master + templates (PPT parity) ----
   The MASTER is deck-level defaults layered over the theme: fonts for headings/
   body, palette overrides, a footer line + slide numbers, and a logo stamped on
   every slide. TEMPLATES are user-saved slides re-insertable from the New-slide
   menu (a lightweight slide-library, not a separate authoring surface). */

export interface DeckMaster {
  fonts?: {
    /* CSS font-family stacks; headings = title/section/H, body = the rest */
    heading?: string;
    body?: string;
  };
  colors?: {
    bg?: string;
    fg?: string;
    accent?: string;
    muted?: string;
  };
  logo?: {
    /* data URL or href */
    src: string;
    pos: "tl" | "tr" | "bl" | "br";
    /* height in design px (default 40) */
    size?: number;
  };
  footer?: {
    text?: string;
    showSlideNum?: boolean;
  };
}

export interface SlideTemplate {
  id: string;
  name: string;
  /* the saved slide, id-less — inserting clones it under fresh ids */
  slide: Omit<Slide, "id">;
}

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
  /* deck-level defaults over the theme (fonts/colors/logo/footer) */
  master?: DeckMaster;
  /* user-saved reusable slides */
  templates?: SlideTemplate[];
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
    /* .pptx import (PowerPoint / Google Slides export) — lazy-loads JSZip */
    pptxImport?: boolean;
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
