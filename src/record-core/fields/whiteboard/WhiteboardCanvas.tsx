import * as React from "react";
import {
  Excalidraw, MainMenu, getSceneVersion,
  convertToExcalidrawElements, viewportCoordsToSceneCoords, CaptureUpdateAction, FONT_FAMILY,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave";
import type { SaveState } from "../../../hooks/useDebouncedSave";
import { liveElements, referencedFiles, type SceneElementLike, type SceneFiles, type WhiteboardScene } from "./scene";
import { ALL_WB_TOOLS, type ResolvedWhiteboardConfig } from "./config";
import { resolveTemplates } from "./templates";
import { createBroadcastPresence, makeSelfPeer, type PresencePeer, type WhiteboardPresence } from "./presence";
import { useNxTheme } from "./useNxTheme";
import type { WbApi, WbAppState, WbElement } from "./wbTypes";
import OpsRail from "./OpsRail";

/* WhiteboardCanvas — the full-depth excalidraw surface: every native tool surfaced
   (image included), the config-gated ops rail (renderTopRightUI), image + record
   drop, and the presence seam. Reusable by the field editor and (later) a standalone
   page. The persisted value is { elements, files? } — files ride along only when an
   image is on the board, so lean drawings stay lean. */

type ExcalidrawElements = readonly SceneElementLike[];

/* the always-available tools (never hidden even if a client narrows config.tools) */
const ALWAYS = new Set(["selection", "hand"]);

/* a scoped stylesheet hiding the toolbar tools this config does not surface. `image`
   is handled through UIOptions.tools.image; the rest are excalidraw toolbar radios —
   the visible control is the <label> WRAPPING the (visually-hidden) input keyed by
   data-testid="toolbar-<tool>", so hide the label (:has), not the input. */
function hiddenToolsCss(scopeId: string, tools: Set<string>): string {
  const hidden = ALL_WB_TOOLS.filter((t) => t !== "image" && !ALWAYS.has(t) && !tools.has(t));
  if (hidden.length === 0) return "";
  const sel = hidden.map((t) => `#${scopeId} .excalidraw label:has([data-testid="toolbar-${t}"])`).join(",");
  return `${sel}{display:none !important;}`;
}

function recordCardSkeleton(rec: { object?: string; id?: string; label: string }, x: number, y: number): Record<string, unknown>[] {
  return [{
    type: "rectangle",
    x, y, width: 190, height: 74,
    backgroundColor: "#e7f5ff",
    strokeColor: "#1971c2",
    fillStyle: "solid",
    strokeWidth: 1,
    roundness: { type: 3 },
    label: { text: rec.label, fontSize: 16, strokeColor: "#1971c2" },
    customData: { recordRef: rec.object && rec.id ? { object: rec.object, id: rec.id } : undefined },
  }];
}

const peersToCollaborators = (peers: PresencePeer[]): Map<string, unknown> =>
  new Map(peers.map((p) => [p.id, {
    id: p.id,
    username: p.username,
    pointer: p.pointer ?? undefined,
    color: { background: p.color, stroke: p.color },
    selectedElementIds: (p.selectedIds ?? []).reduce<Record<string, true>>((a, id) => { a[id] = true; return a; }, {}),
  }]));

export interface WhiteboardCanvasProps {
  value: unknown;
  onSave: (value: WhiteboardScene) => void;
  readOnly?: boolean;
  config: ResolvedWhiteboardConfig;
  boardId: string;
  username?: string;
  /* remount key — the field flips this on mobile/overlay transitions to reseed */
  epoch: string;
  onSaveState?: (s: SaveState) => void;
}

export default function WhiteboardCanvas({ value, onSave, readOnly, config, boardId, username, epoch, onSaveState }: WhiteboardCanvasProps) {
  const scopeId = React.useId().replace(/[:]/g, "");
  const theme = useNxTheme();
  // the identity peers SEE on the wire (self is labelled "You" in the rail); a friendly
  // guest name when the host does not supply one, so multi-tab avatars stay distinct
  const wireName = React.useMemo(() => username ?? `Guest-${Math.random().toString(36).slice(2, 6)}`, [username]);
  const apiRef = React.useRef<WbApi | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [ready, setReady] = React.useState(false);
  const [peers, setPeers] = React.useState<PresencePeer[]>([]);
  // reactive selection (drives the ops rail); updated from excalidraw's onChange
  const [selection, setSelection] = React.useState<Record<string, boolean>>({});
  const selSig = React.useRef("");
  // op-feedback toast (bottom-centre of the canvas; fired by the ops rail)
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | undefined>(undefined);
  const flash = React.useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  // compact rail when the canvas itself is narrow (mobile overlay / small embeds), and
  // fit a POPULATED board to view once the canvas has a real size — the field can mount
  // below the fold where an early fit measures a 0-size viewport. Fires from here (real
  // size) OR the ready-effect below, whichever lands after both are ready; once only.
  const [compact, setCompact] = React.useState(false);
  const didFit = React.useRef(false);
  const fitToView = React.useCallback(() => {
    const api = apiRef.current;
    if (!api || didFit.current) return;
    const els = api.getSceneElements();
    if (els.length <= 3) return;
    api.scrollToContent(els, { fitToViewport: true, viewportZoomFactor: 0.8, animate: false } as never);
    didFit.current = true;
  }, []);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      setCompact(e.contentRect.width < 560);
      if (e.contentRect.width > 200) fitToView();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToView]);

  // seed-once per mount (keyed by epoch upstream): the canvas owns the live scene
  const seed = React.useMemo(() => {
    const s = value as WhiteboardScene | null;
    return { elements: liveElements(value) as unknown[], files: (s?.files ?? {}) as SceneFiles };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);
  const lastVersion = React.useRef(0);
  const lastFilesSig = React.useRef("");
  React.useMemo(() => { lastVersion.current = getSceneVersion(seed.elements as never); }, [seed]);

  const { saveState, trigger: saveScene } = useDebouncedSave<WhiteboardScene>((next) => onSave(next), 700);
  React.useEffect(() => { onSaveState?.(saveState); }, [saveState, onSaveState]);

  // the other fit trigger: once excalidraw hands us its API (ready), fit after it
  // settles — catches the case where the canvas already had its size before ready.
  React.useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(fitToView, 220);
    return () => window.clearTimeout(t);
  }, [ready, fitToView]);

  const onChange = React.useCallback((elements: ExcalidrawElements, appState: WbAppState, files: SceneFiles) => {
    // reactive selection snapshot for the ops rail (updates only when the set changes)
    const sel = appState?.selectedElementIds || {};
    const sig = Object.keys(sel).filter((k) => sel[k]).sort().join(",");
    if (sig !== selSig.current) { selSig.current = sig; setSelection({ ...sel }); }
    const v = getSceneVersion(elements as never);
    const live = elements.filter((e) => !e.isDeleted);
    const refFiles = referencedFiles(live, files ?? {});
    const filesSig = Object.keys(refFiles).sort().join(",");
    if (v === lastVersion.current && filesSig === lastFilesSig.current) return; // viewport/selection/presence only
    lastVersion.current = v;
    lastFilesSig.current = filesSig;
    saveScene(filesSig ? { elements: live as WhiteboardScene["elements"], files: refFiles } : { elements: live as WhiteboardScene["elements"] });
  }, [saveScene]);

  // presence provider lifecycle (opt-in)
  const presenceRef = React.useRef<WhiteboardPresence | null>(null);
  React.useEffect(() => {
    if (!config.presence || readOnly) return;
    const provider = createBroadcastPresence(boardId, makeSelfPeer(wireName));
    presenceRef.current = provider;
    const unsub = provider.subscribe((list) => {
      setPeers(list);
      apiRef.current?.updateScene({ collaborators: peersToCollaborators(list) });
    });
    return () => { unsub(); provider.dispose(); presenceRef.current = null; setPeers([]); };
  }, [config.presence, readOnly, boardId, wireName]);

  const lastBroadcast = React.useRef(0);
  const onPointerUpdate = React.useCallback((payload: { pointer: { x: number; y: number } }) => {
    const now = Date.now();
    if (now - lastBroadcast.current < 50) return; // throttle the wire
    lastBroadcast.current = now;
    presenceRef.current?.broadcastPointer(payload.pointer);
  }, []);

  const onDrop = React.useCallback((e: React.DragEvent) => {
    if (!config.recordDrag || readOnly || !apiRef.current) return;
    const raw = e.dataTransfer.getData("application/x-nexus-record") || e.dataTransfer.getData("text/plain");
    if (!raw) return; // an image/file drop — let excalidraw place it natively
    let rec: { object?: string; id?: string; label?: string } | null = null;
    try { rec = JSON.parse(raw); } catch { return; }
    if (!rec || !rec.label) return;
    e.preventDefault();
    e.stopPropagation();
    const api = apiRef.current;
    const scene = viewportCoordsToSceneCoords({ clientX: e.clientX, clientY: e.clientY }, api.getAppState() as never);
    const created = convertToExcalidrawElements(recordCardSkeleton(rec as { label: string }, scene.x, scene.y) as never) as unknown as WbElement[];
    api.updateScene({ elements: [...(api.getSceneElements() as WbElement[]), ...created], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [config.recordDrag, readOnly]);

  const templates = React.useMemo(() => resolveTemplates(config.templates), [config.templates]);

  const UI_OPTIONS = React.useMemo(() => ({
    canvasActions: {
      changeViewBackgroundColor: false,
      clearCanvas: config.clearCanvas,
      export: false,
      loadScene: false,
      saveToActiveFile: false,
      toggleTheme: false,
      saveAsImage: config.saveAsImage,
    },
    tools: { image: config.imageTool },
  }), [config.clearCanvas, config.saveAsImage, config.imageTool]);

  const css = hiddenToolsCss(scopeId, config.tools);

  return (
    <div id={scopeId} ref={wrapRef} className="nxWbCanvasInner" onDrop={onDrop} onDragOver={(e) => { if (config.recordDrag) e.preventDefault(); }} data-testid="wb-canvas-inner">
      {css && <style>{css}</style>}
      <Excalidraw
        theme={theme}
        viewModeEnabled={readOnly}
        gridModeEnabled={config.grid}
        zenModeEnabled={config.zenMode}
        objectsSnapModeEnabled={config.snap}
        isCollaborating={config.presence && !readOnly}
        UIOptions={UI_OPTIONS as never}
        excalidrawAPI={(api) => { apiRef.current = api as unknown as WbApi; setReady(true); }}
        initialData={{ elements: seed.elements as never, files: seed.files as never, appState: { showWelcomeScreen: false, viewBackgroundColor: "transparent", currentItemFontFamily: FONT_FAMILY.Nunito /* new text defaults to the normal sans (the picker's "Normal"), not the hand-drawn face — native-not-widget; existing elements keep their font, hand-drawn stays one click away */ } as never, scrollToContent: seed.elements.length <= 3 /* small/empty: corner default; populated: the fit-to-view effect owns it */ }}
        onChange={onChange as never}
        onPointerUpdate={onPointerUpdate as never}
      >
        <MainMenu>
          {config.saveAsImage && <MainMenu.DefaultItems.SaveAsImage />}
          {config.clearCanvas && <MainMenu.DefaultItems.ClearCanvas />}
        </MainMenu>
      </Excalidraw>
      {ready && !readOnly && apiRef.current && (
        <OpsRail api={apiRef.current} config={config} selection={selection} compact={compact} templates={templates} peers={peers} onFlash={flash} />
      )}
      {toast && <div className="nxWbToast" role="status" data-testid="wb-ops-toast">{toast}</div>}
    </div>
  );
}
