import * as React from "react";

/* Viewer3D block — a 3D object / floor-plan viewer as a standalone surface. The
   heavy engine (Viewer3DSurface + three.js) ships ONLY behind this lazy split:
   a consumer importing the block gets the light helpers + types eagerly and the
   WebGL chunk only when the surface actually mounts. */

export {
  VIEWER3D_STORE_PREFIX,
  viewer3dStoreKey,
  isViewer3dSnapshot,
  seedScene,
} from "./scene";
export type {
  Viewer3DSnapshot,
  Viewer3DMode,
  Viewer3DHotspot,
  HotspotTone,
  Viewer3DModelSource,
  Viewer3DObjectConfig,
  Viewer3DFloorplanConfig,
  Viewer3DLevel,
  Viewer3DRoom,
} from "./scene";
export type { Viewer3DSurfaceProps } from "./Viewer3DSurface";

/* the lazy surface — host renders it under a Suspense fallback */
export const LazyViewer3DSurface = React.lazy(() => import("./Viewer3DSurface"));
