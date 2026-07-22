/* Pure whiteboard-scene helpers — no excalidraw import (eager-safe, node-testable).
   The persisted value is plain JSON: { elements: [...], files?: {...} }. Elements are
   excalidraw's own flat serializable objects; these helpers only rely on the stable
   identity fields (id/version/isDeleted). `files` is excalidraw's BinaryFiles map
   (image dataURLs keyed by fileId) — carried so the image tool round-trips; it is
   OPTIONAL and a scene without it stays valid (the v1 elements-only shape). An
   `appState` key is TOLERATED on read (older writes) but never written and never
   restored — scene coordinates absorb the authoring-time canvas offset, so mounts
   always scroll to content instead. */

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

/* excalidraw BinaryFiles shape, kept structural so this file imports nothing:
   { [fileId]: { id, dataURL, mimeType, created, ... } } */
export type SceneFiles = Record<string, { id?: string; dataURL?: string; mimeType?: string; [k: string]: unknown }>;

export interface WhiteboardScene {
  elements: SceneElementLike[];
  files?: SceneFiles;
  appState?: Partial<SceneViewport>;
}

export const isScene = (v: unknown): v is WhiteboardScene =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  Array.isArray((v as WhiteboardScene).elements);

/* the elements a viewer sees (excalidraw keeps isDeleted tombstones) */
export const liveElements = (v: unknown): SceneElementLike[] =>
  isScene(v) ? v.elements.filter((e) => e && typeof e === "object" && !e.isDeleted) : [];

export const elementCount = (v: unknown): number => liveElements(v).length;

/* the image blobs a scene carries (empty for a lean drawing) */
export const sceneFiles = (v: unknown): SceneFiles =>
  isScene(v) && v.files && typeof v.files === "object" && !Array.isArray(v.files) ? v.files : {};

/* only the files still referenced by a live image element — drop orphaned blobs so a
   deleted image does not leave its base64 payload in the persisted value forever */
export const referencedFiles = (elements: SceneElementLike[], files: SceneFiles): SceneFiles => {
  const used = new Set<string>();
  for (const e of elements) {
    const fid = (e as { fileId?: unknown }).fileId;
    if (typeof fid === "string") used.add(fid);
  }
  const out: SceneFiles = {};
  for (const [k, val] of Object.entries(files)) if (used.has(k)) out[k] = val;
  return out;
};

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
