/* Pure whiteboard-scene helpers — no excalidraw import (eager-safe, node-testable).
   The persisted value is plain JSON: { elements: [...] }. Elements are excalidraw's
   own flat serializable objects; these helpers only rely on the stable identity
   fields (id/version/isDeleted). An `appState` key is TOLERATED on read (older
   writes) but never written and never restored — scene coordinates absorb the
   authoring-time canvas offset, so mounts always scroll to content instead. */

export interface SceneViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface SceneElementLike {
  id: string;
  version?: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}

export interface WhiteboardScene {
  elements: SceneElementLike[];
  appState?: Partial<SceneViewport>;
}

export const isScene = (v: unknown): v is WhiteboardScene =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  Array.isArray((v as WhiteboardScene).elements);

/* the elements a viewer sees (excalidraw keeps isDeleted tombstones) */
export const liveElements = (v: unknown): SceneElementLike[] =>
  isScene(v) ? v.elements.filter((e) => e && typeof e === "object" && !e.isDeleted) : [];

export const elementCount = (v: unknown): number => liveElements(v).length;

/* cache identity for a scene's CONTENT: id:version pairs uniquely identify an
   element state (excalidraw's own reconciliation model), so two signatures match
   exactly when the drawn content matches */
export const sceneSignature = (v: unknown): string =>
  liveElements(v).map((e) => `${e.id}:${e.version ?? 0}`).join("|");

/* one-line text for formatCell / CSV / palette surfaces */
export const previewLabel = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (!isScene(v)) return "canvas (unreadable value)";
  const n = elementCount(v);
  return n === 0 ? "" : `canvas · ${n} element${n === 1 ? "" : "s"}`;
};
