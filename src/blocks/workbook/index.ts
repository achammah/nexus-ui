import * as React from "react";

/* Workbook block — a full Univer spreadsheet as a standalone surface. The heavy
   engine (WorkbookSurface + @univerjs) ships ONLY behind this lazy split, so a
   consumer importing the block gets the light helpers + types eagerly and the
   ~1.6MB-gz engine chunk only when the surface actually mounts. */

export {
  WORKBOOK_STORE_PREFIX,
  workbookStoreKey,
  isWorkbookSnapshot,
  seedWorkbook,
  seedLargeWorkbook,
} from "./snapshot";
export {
  deriveWorkbookTheme,
  accentScale,
  neutralScale,
  resolveCssColor,
  withLightTokens,
  skinSignature,
  themeSignature,
  isDarkTheme,
  useThemeNonce,
  type UniverTheme,
  type ColorScale,
} from "./workbook-theme";
export type { WorkbookSurfaceProps } from "./WorkbookSurface";

/* the lazy surface — host renders it under a Suspense fallback */
export const LazyWorkbookSurface = React.lazy(() => import("./WorkbookSurface"));
