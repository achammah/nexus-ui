import * as React from "react";

/* Presentation block — a deck editor + papermark-style share/track layer as a
   standalone free surface. The editor itself is light; the only heavy piece
   (pptxgenjs) hides behind its own dynamic import inside export.ts, so this
   barrel is safe to import eagerly. The lazy surface export mirrors the
   workbook block so hosts wire both the same way. */

export {
  PRESENTATION_STORE_PREFIX,
  presentationStoreKey,
  isDeckSnapshot,
  seedDeck,
  createSlide,
  applyViewEvent,
} from "./snapshot";
export type {
  DeckSnapshot,
  Slide,
  SlideBlocks,
  SlideLayout,
  SlideTransition,
  DeckThemeId,
  ShareLink,
  ViewSession,
  ViewEvent,
  DataRoom,
  DataRoomItem,
  PresentationConfig,
} from "./types";
export { PresentationSurface, type PresentationSurfaceProps } from "./PresentationSurface";
export { PresentationViewer, type PresentationViewerProps } from "./PresentationViewer";
export { PresentMode, type PresentModeProps } from "./PresentMode";
export { SlideView, sanitizeHtml, LAYOUTS } from "./SlideView";
export { exportDeckToPdf, exportDeckToPptx } from "./export";

/* lazy variant — host renders it under a Suspense fallback */
export const LazyPresentationSurface = React.lazy(() => import("./PresentationSurface"));
