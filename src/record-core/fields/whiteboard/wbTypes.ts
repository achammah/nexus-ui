/* Minimal structural types over excalidraw's imperative API + app state — only the
   surface the ops rail and canvas touch. Kept structural (not a deep type import from
   excalidraw's dist) so the whiteboard stays resilient to excalidraw's type-path
   layout; the real API is a superset and satisfies these shapes at runtime. */

export interface WbElement {
  id: string;
  type: string;
  version?: number;
  groupIds?: string[];
  index?: unknown;
  [k: string]: unknown;
}

export interface WbAppState {
  selectedElementIds: Record<string, boolean>;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  currentItemStrokeColor?: string;
  currentItemBackgroundColor?: string;
  [k: string]: unknown;
}

export interface WbSceneUpdate {
  elements?: readonly WbElement[];
  appState?: Record<string, unknown>;
  collaborators?: Map<string, unknown>;
  captureUpdate?: unknown;
}

export interface WbApi {
  updateScene(scene: WbSceneUpdate): void;
  getSceneElements(): readonly WbElement[];
  getSceneElementsIncludingDeleted(): readonly WbElement[];
  getAppState(): WbAppState;
  getFiles(): Record<string, unknown>;
  addFiles(files: unknown[]): void;
  scrollToContent(target?: unknown, opts?: unknown): void;
  setActiveTool(tool: { type: string }): void;
}

/* bump an element's version so getSceneVersion advances (persistence + undo capture) */
export function touch(e: WbElement): WbElement {
  return { ...e, version: (Number(e.version) || 0) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() };
}
