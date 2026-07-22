/* Whiteboard config surface — the client-composable option set (the calendar-view
   lesson applied to a field): every capability is config-declared with a sensible
   DEFAULT (so it works out of the box) AND overridable (so a client tailors it).
   Declared on the field as `whiteboard: {...}` in config; resolved once here into a
   fully-defaulted shape the canvas reads. Pure/eager-safe — no excalidraw import.

   Reference for the option list: RECIPES "Add a whiteboard (canvas) field". */

/* Every excalidraw tool we can surface. `image` is toggled through excalidraw's own
   UIOptions.tools.image; the rest are surfaced/hidden via a scoped stylesheet over
   the toolbar radios (data-testid="toolbar-<key>"). */
export const ALL_WB_TOOLS = [
  "selection",
  "hand",
  "freedraw",
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
  "text",
  "image",
  "eraser",
  "frame",
  "laser",
] as const;
export type WhiteboardTool = (typeof ALL_WB_TOOLS)[number];

/* Built-in insertable template keys (see templates.ts). A client may also inline a
   full template object; both forms are accepted in config. */
export type BuiltinTemplateKey = "kanban" | "matrix2x2" | "flow" | "timeline" | "mindmap";

export interface InlineTemplate {
  key: string;
  label: string;
  /* excalidraw element skeletons (convertToExcalidrawElements input) */
  elements: unknown[];
}
export type TemplateRef = BuiltinTemplateKey | InlineTemplate;

/* The raw config a client writes on the field (all keys optional). */
export interface WhiteboardConfig {
  /* which tools are surfaced — an allowlist, or "all" (default). Unlisted tools are
     hidden from the toolbar; `image` additionally toggles excalidraw's image tool. */
  tools?: WhiteboardTool[] | "all";
  /* a quick-palette strip (stroke + fill swatches) shown in the ops rail; sets the
     active item colors with one click. Empty array → no strip. */
  palette?: string[];
  /* insertable templates offered in the Templates menu; "all" → every built-in. */
  templates?: TemplateRef[] | "all" | false;
  /* boolean/shape ops (add/subtract/intersect/exclude/split) in the ops rail */
  booleanOps?: boolean;
  /* arrange controls (z-order + group/ungroup) in the ops rail */
  arrange?: boolean;
  /* drop a record onto the canvas to drop a linked card at that point */
  recordDrag?: boolean;
  /* live presence (remote cursors) — the collaborative seam. Default off; when on,
     wires a same-origin BroadcastChannel provider (yjs swaps in later). */
  presence?: boolean;
  /* excalidraw canvas modes */
  grid?: boolean;
  zenMode?: boolean;
  snap?: boolean;
  /* main-menu canvas actions */
  saveAsImage?: boolean;
  clearCanvas?: boolean;
}

export interface ResolvedWhiteboardConfig {
  tools: Set<WhiteboardTool>;
  imageTool: boolean;
  palette: string[];
  templates: TemplateRef[]; // resolved list ([] when disabled)
  booleanOps: boolean;
  arrange: boolean;
  recordDrag: boolean;
  presence: boolean;
  grid: boolean;
  zenMode: boolean;
  snap: boolean;
  saveAsImage: boolean;
  clearCanvas: boolean;
}

/* a restrained default palette — the app accent plus a small, legible spread that
   reads on both themes (excalidraw's own picker stays available for anything else) */
export const DEFAULT_WB_PALETTE = [
  "#1e1e1e",
  "#e03131",
  "#e8590c",
  "#f08c00",
  "#2f9e44",
  "#1971c2",
  "#6741d9",
  "#e64980",
];

const ALL_TEMPLATES: BuiltinTemplateKey[] = ["kanban", "matrix2x2", "flow", "timeline", "mindmap"];

function resolveTemplates(t: WhiteboardConfig["templates"]): TemplateRef[] {
  if (t === false) return [];
  if (t === undefined || t === "all") return [...ALL_TEMPLATES];
  return t;
}

/* Resolve the field's `whiteboard` config into a fully-defaulted shape. The DEFAULT
   is full depth: every tool surfaced (image included), all ops on, palette + all
   templates present, record-drag on, presence off (opt-in). A client narrows from
   there. Reading a bare field (no config) yields the full-depth default. */
export function resolveWhiteboardConfig(raw: WhiteboardConfig | undefined | null): ResolvedWhiteboardConfig {
  const c = raw ?? {};
  const toolList: WhiteboardTool[] =
    !c.tools || c.tools === "all" ? [...ALL_WB_TOOLS] : c.tools.filter((t) => (ALL_WB_TOOLS as readonly string[]).includes(t));
  const tools = new Set(toolList);
  return {
    tools,
    imageTool: tools.has("image"),
    palette: c.palette ?? DEFAULT_WB_PALETTE,
    templates: resolveTemplates(c.templates),
    booleanOps: c.booleanOps ?? true,
    arrange: c.arrange ?? true,
    recordDrag: c.recordDrag ?? true,
    presence: c.presence ?? false,
    grid: c.grid ?? false,
    zenMode: c.zenMode ?? false,
    snap: c.snap ?? true,
    saveAsImage: c.saveAsImage ?? true,
    clearCanvas: c.clearCanvas ?? true,
  };
}
