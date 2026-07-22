// adapted from Univer (@univerjs, Apache-2.0) — mounts the published preset as a
// standalone app-shell; no source is lifted, the engine is a pinned dependency.
import * as React from "react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
// Feature presets — each is WIRING of a capability Univer already ships; they enter
// the presets array only when the config enables them (and their locales/CSS ride
// this lazy chunk regardless, so importing the block still adds nothing eager).
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import UniverPresetSheetsFilterEnUS from "@univerjs/preset-sheets-filter/locales/en-US";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import UniverPresetSheetsSortEnUS from "@univerjs/preset-sheets-sort/locales/en-US";
import { UniverSheetsConditionalFormattingPreset } from "@univerjs/preset-sheets-conditional-formatting";
import UniverPresetSheetsConditionalFormattingEnUS from "@univerjs/preset-sheets-conditional-formatting/locales/en-US";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import UniverPresetSheetsDataValidationEnUS from "@univerjs/preset-sheets-data-validation/locales/en-US";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import UniverPresetSheetsFindReplaceEnUS from "@univerjs/preset-sheets-find-replace/locales/en-US";
import { UniverSheetsNotePreset } from "@univerjs/preset-sheets-note";
import UniverPresetSheetsNoteEnUS from "@univerjs/preset-sheets-note/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { defaultTheme } from "@univerjs/themes";
import { CommandType, ThemeService, type IWorkbookData } from "@univerjs/core";
import { IRenderManagerService } from "@univerjs/engine-render";
import { ComponentManager } from "@univerjs/ui";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import "@univerjs/preset-sheets-note/lib/index.css";
import "./workbook.css";
import { resolveWorkbookConfig, type WorkbookConfig } from "./config";
import { WorkbookIO, type WorkbookIOController } from "./workbook-actions";
import { canvasGridTheme, deriveWorkbookTheme, isDarkTheme, skinSignature, themeSignature, useThemeNonce, withLightTokens, type CanvasGridTheme, type UniverTheme } from "./workbook-theme";
import { registerNxIcons, type IconRegistry } from "./workbook-icons";
import { seedWorkbook } from "./snapshot";

export interface WorkbookSurfaceProps {
  /* the workbook to load; null seeds the demo workbook */
  value: IWorkbookData | null;
  /* fired on every persisted change (data/insert/format/merge) — the host debounces */
  onChange?: (snapshot: IWorkbookData) => void;
  /* bump to force a fresh mount from the current `value` (reset, external reload) */
  reloadNonce?: number;
  className?: string;
  /* host controls (save state, reset) — rendered INTO the right end of Univer's own
     toolbar row so the page needs no extra header strip of its own */
  actions?: React.ReactNode;
  /* which Excel capabilities this surface carries (import/export, filters, sort,
     conditional formatting, data validation, find & replace, notes). Omitted keys
     fall back to the full-Excel defaults; pass a narrowed object for a simpler grid. */
  config?: Partial<WorkbookConfig>;
  "data-testid"?: string;
}

/* Assemble the presets array + merged locale from the resolved config. Core is
   always present; each feature preset (a capability Univer already ships) joins only
   when enabled. importExport is NOT a preset — it is built toolbar actions, handled
   separately — so it does not appear here. */
function buildPresets(cfg: WorkbookConfig, container: HTMLElement) {
  const presets: unknown[] = [UniverSheetsCorePreset({ container, ribbonType: "simple" })];
  const locales: object[] = [UniverPresetSheetsCoreEnUS];
  if (cfg.filters) { presets.push(UniverSheetsFilterPreset()); locales.push(UniverPresetSheetsFilterEnUS); }
  if (cfg.sort) { presets.push(UniverSheetsSortPreset()); locales.push(UniverPresetSheetsSortEnUS); }
  if (cfg.conditionalFormatting) { presets.push(UniverSheetsConditionalFormattingPreset()); locales.push(UniverPresetSheetsConditionalFormattingEnUS); }
  if (cfg.dataValidation) { presets.push(UniverSheetsDataValidationPreset()); locales.push(UniverPresetSheetsDataValidationEnUS); }
  if (cfg.findReplace) { presets.push(UniverSheetsFindReplacePreset()); locales.push(UniverPresetSheetsFindReplaceEnUS); }
  if (cfg.notes) { presets.push(UniverSheetsNotePreset()); locales.push(UniverPresetSheetsNoteEnUS); }
  return { presets, locale: mergeLocales(...locales) };
}

type Injector = { get: (token: unknown) => unknown };
type UniverInstance = {
  univer: { dispose: () => void; __getInjector: () => Injector };
  univerAPI: UniverApi;
};
interface FSheet { getSheetId?: () => string }
interface FWorkbook {
  save: () => IWorkbookData;
  getId?: () => string;
  getActiveSheet?: () => FSheet | null;
}
interface UniverApi {
  createWorkbook: (data: IWorkbookData) => void;
  getActiveWorkbook: () => FWorkbook | null;
  disposeUnit: (unitId: string) => void;
  toggleDarkMode: (isDark: boolean) => void;
  onCommandExecuted: (cb: (command: { type: number; id: string }) => void) => { dispose: () => void };
}
interface UniverThemeService {
  setTheme: (theme: unknown) => void;
  setDarkMode: (dark: boolean) => void;
}
interface HeaderComponent {
  setCustomHeader: (cfg: { headerStyle: Record<string, string | number> }, sheetId?: string) => void;
}
interface GridContext { renderConfig?: Record<string, unknown> }
interface GridCanvas { getContext?: () => GridContext | null }
interface RenderUnit {
  engine?: { getCanvas?: () => GridCanvas | null };
  /* _cacheCanvas is Univer-internal (per-viewport paint target — the sheet's grid
     strokes land there, not on the composite canvas); pinned to 0.25.1 and probed
     defensively, with a journey pixel-asserting the painted result */
  scene?: { getViewports?: () => Array<{ _cacheCanvas?: GridCanvas | null }> };
  components?: Map<string, unknown>;
  mainComponent?: { makeDirty?: (state?: boolean) => void };
}
interface RenderManager { getRenderById: (unitId: string) => RenderUnit | null }

/* Builds the light-anchored theme from the live tokens. Univer's canvas derives its
   dark rendering by inverting this palette, and its DOM chrome gets the exact
   per-mode values from workbook.css — so ONE light-anchored object serves both. */
const derive = () =>
  withLightTokens((resolve) => deriveWorkbookTheme(defaultTheme as unknown as UniverTheme, resolve));
const deriveGrid = () => withLightTokens((resolve) => canvasGridTheme(resolve));

/* Push the canvas-grid theme into the sheet's render unit: the gridline stroke
   rides the open `ctx.renderConfig.gridlinesColor` hook, the row/column headers go
   through their components' `setCustomHeader` (the same surface sheets-ui's own
   header-size commands use), then a forced dirty repaints. Returns false while the
   render unit does not exist yet (it is created on the Rendered lifecycle stage,
   after createWorkbook returns). */
function applyGridCanvasTheme(injector: Injector, unitId: string, grid: CanvasGridTheme): boolean {
  const rms = injector.get(IRenderManagerService) as RenderManager | null;
  const render = rms?.getRenderById(unitId);
  if (!render) return false;
  // the grid strokes paint on each VIEWPORT's cache context (main pane + frozen
  // panes each have one); the engine's composite context is included for the
  // cache-disabled path
  const contexts = [
    render.engine?.getCanvas?.()?.getContext?.(),
    ...(render.scene?.getViewports?.() ?? []).map((vp) => vp?._cacheCanvas?.getContext?.()),
  ];
  for (const ctx of contexts) {
    if (ctx?.renderConfig) ctx.renderConfig.gridlinesColor = grid.gridlinesColor;
  }
  const headerStyle = {
    backgroundColor: grid.header.backgroundColor,
    fontColor: grid.header.fontColor,
    borderColor: grid.header.borderColor,
    fontFamily: grid.header.fontFamily,
  };
  (render.components?.get("__SpreadsheetRowHeader__") as HeaderComponent | undefined)?.setCustomHeader({ headerStyle });
  (render.components?.get("__SpreadsheetColumnHeader__") as HeaderComponent | undefined)?.setCustomHeader({ headerStyle });
  render.mainComponent?.makeDirty?.(true);
  return true;
}

/* WorkbookSurface — a full Univer workbook (formula bar, 400+ functions, insert
   rows/cols, formatting, multi-sheet, freeze/merge) mounted into a container. It is
   free-surface: the host owns the snapshot (load/persist through the app store); this
   component owns the Univer lifecycle, the token->palette theme, the dark-mode sync,
   and the change stream. The vendor chrome is collapsed to ONE toolbar row
   (ribbonType "simple") and host `actions` overlay its right end, so the surface
   reads as the page itself, not a boxed widget. StrictMode-safe: one instance,
   fully disposed on cleanup. */
export function WorkbookSurface({
  value,
  onChange,
  reloadNonce = 0,
  className,
  actions,
  config,
  ...rest
}: WorkbookSurfaceProps) {
  const cfg = React.useMemo(() => resolveWorkbookConfig(config), [config]);
  const cfgRef = React.useRef(cfg);
  cfgRef.current = cfg;
  const hostRef = React.useRef<HTMLDivElement>(null);
  const apiRef = React.useRef<UniverApi | null>(null);
  const themeRef = React.useRef<UniverThemeService | null>(null);
  const injectorRef = React.useRef<Injector | null>(null);
  const unitIdRef = React.useRef<string>("");
  const appliedSigRef = React.useRef<string>("");
  const appliedSkinRef = React.useRef<string>("");
  const [phase, setPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const nonce = useThemeNonce();

  // latest props without re-mounting on every render
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // mount (and re-mount when reloadNonce changes); dispose fully on cleanup
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let instance: UniverInstance | null = null;
    let cmdSub: { dispose: () => void } | null = null;
    let gridRaf = 0;
    try {
      const sig = themeSignature();
      const skinSig = skinSignature();
      const { presets, locale } = buildPresets(cfgRef.current, host);
      const created = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: locale },
        theme: derive() as unknown as typeof defaultTheme,
        presets: presets as Parameters<typeof createUniver>[0]["presets"],
      }) as unknown as UniverInstance;
      instance = created;
      apiRef.current = created.univerAPI;
      const injector = created.univer.__getInjector();
      // icon-language swap BEFORE the workbench's first commit: every registry-
      // resolved icon (toolbar, dropdowns, context menus) renders app-language
      // from the first paint; registrations are per-instance, disposed with it
      registerNxIcons(injector.get(ComponentManager) as IconRegistry);
      themeRef.current = injector.get(ThemeService) as UniverThemeService;
      appliedSigRef.current = sig;
      appliedSkinRef.current = skinSig;
      const data = valueRef.current ?? seedWorkbook();
      created.univerAPI.createWorkbook(data);
      created.univerAPI.toggleDarkMode(isDarkTheme());
      // the render unit lands on the Rendered lifecycle stage (after this effect):
      // retry the canvas-grid theme for a bounded run of frames, then hand the
      // applier to the re-theme effect for skin re-derives
      unitIdRef.current = data.id;
      injectorRef.current = injector;
      const grid = deriveGrid();
      let tries = 0;
      const tick = () => {
        if (applyGridCanvasTheme(injector, data.id, grid)) {
          // late sheet controllers (permission, gridlines) re-register a few stock
          // icon names during workbook init — re-assert the app set once the
          // render unit exists (idempotent, delete-then-register)
          registerNxIcons(injector.get(ComponentManager) as IconRegistry);
          return;
        }
        if (tries++ > 120) return;
        gridRaf = requestAnimationFrame(tick);
      };
      gridRaf = requestAnimationFrame(tick);
      // persist on data-changing commands only (mutations), not selection/scroll.
      // A freeze change rebuilds viewports (fresh cache contexts) — re-apply the
      // grid theme so the new panes keep the themed gridlines.
      cmdSub = created.univerAPI.onCommandExecuted((command) => {
        if (command.type !== CommandType.MUTATION) return;
        if (command.id.includes("set-frozen") && injectorRef.current && unitIdRef.current) {
          requestAnimationFrame(() => {
            if (injectorRef.current && unitIdRef.current)
              applyGridCanvasTheme(injectorRef.current, unitIdRef.current, deriveGrid());
          });
        }
        const fWorkbook = created.univerAPI.getActiveWorkbook();
        if (fWorkbook) onChangeRef.current?.(fWorkbook.save());
      });
      setPhase("ready");
    } catch {
      setPhase("error");
    }
    return () => {
      cancelAnimationFrame(gridRaf);
      cmdSub?.dispose();
      try { instance?.univer.dispose(); } catch { /* already gone */ }
      apiRef.current = null;
      themeRef.current = null;
      injectorRef.current = null;
      unitIdRef.current = "";
      if (host) host.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadNonce, cfg]);

  // live re-theme when the app theme flips (data-theme) or a skin lands. The two
  // inputs are handled separately: a SKIN change re-derives the light-anchored
  // palette and pushes it through Univer's ThemeService (the workbench re-injects
  // the --univer-* vars from it); a THEME flip only re-syncs Univer's dark mode —
  // the derived object is a function of the tokens alone, so the flip path never
  // runs the forced-light probe and never writes data-theme. setDarkMode re-emits
  // through the render engine's subscription (force-repainting every canvas
  // layer); toggleDarkMode keeps the .univer-dark class (DOM role swap) in sync.
  // The signature checks make the pass idempotent: observer echoes (including the
  // skin probe's own flip/restore) exit here instead of looping.
  React.useEffect(() => {
    const api = apiRef.current;
    const themeService = themeRef.current;
    if (!api || !themeService || phase !== "ready") return;
    const sig = themeSignature();
    if (sig === appliedSigRef.current) return;
    appliedSigRef.current = sig;
    const skinSig = skinSignature();
    if (skinSig !== appliedSkinRef.current) {
      appliedSkinRef.current = skinSig;
      themeService.setTheme(derive());
      // the canvas-grid layer (gridlines, headers) re-derives with the skin too
      if (injectorRef.current && unitIdRef.current)
        applyGridCanvasTheme(injectorRef.current, unitIdRef.current, deriveGrid());
    }
    const dark = isDarkTheme();
    themeService.setDarkMode(dark);
    api.toggleDarkMode(dark);
    // a theme/skin write can land while this pass runs (its observer bump is
    // already queued): if the inputs moved, drop the stored signatures so the
    // queued pass re-applies instead of exiting on a stale match
    if (themeSignature() !== sig) { appliedSigRef.current = ""; appliedSkinRef.current = ""; }
  }, [nonce, phase]);

  // IO controller — reads/replaces the live workbook for the import/export actions.
  // replaceWorkbook disposes the current unit and mounts the imported data through the
  // SAME facade path the initial mount uses, then re-applies the grid-canvas theme +
  // app icons to the new render unit and pushes the new snapshot to the host so it
  // persists. Kept in a ref-backed memo so the actions band never re-renders it.
  const ioController = React.useMemo<WorkbookIOController>(() => ({
    getSnapshot: () => apiRef.current?.getActiveWorkbook()?.save() ?? null,
    getActiveSheetId: () => apiRef.current?.getActiveWorkbook()?.getActiveSheet?.()?.getSheetId?.(),
    replaceWorkbook: (data) => {
      const api = apiRef.current;
      if (!api) return;
      const current = api.getActiveWorkbook();
      const currentId = current?.getId?.();
      try { if (currentId) api.disposeUnit(currentId); } catch { /* already gone */ }
      api.createWorkbook(data);
      api.toggleDarkMode(isDarkTheme());
      unitIdRef.current = data.id;
      // re-theme the fresh render unit (bounded retry until it exists) + re-assert icons
      const injector = injectorRef.current;
      if (injector) {
        const grid = deriveGrid();
        let tries = 0;
        const tick = () => {
          if (applyGridCanvasTheme(injector, data.id, grid)) {
            registerNxIcons(injector.get(ComponentManager) as IconRegistry);
            return;
          }
          if (tries++ > 120) return;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      onChangeRef.current?.(api.getActiveWorkbook()?.save() ?? data);
    },
  }), []);

  const showIO = cfg.importExport && phase === "ready";
  const showBand = (actions || showIO) && phase === "ready";

  return (
    <div
      className={[
        "nxWorkbook",
        actions ? "nxWorkbook--hostActions" : "",
        showIO ? "nxWorkbook--io" : "",
        phase === "error" ? "nxWorkbookError" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      <div className="nxWorkbookHost">
        {/* Univer owns this div exclusively — no React children here, or React and
            Univer fight over the same nodes (removeChild). Overlays are siblings. */}
        <div className="nxWorkbookMount" ref={hostRef} data-testid="workbook-host" aria-label="Spreadsheet workbook" role="application" />
        {showBand && (
          /* the workbook's own controls (import/export) + any host actions live INSIDE
             the vendor toolbar band (its right end stays clear via a reserved inset in
             workbook.css) — one continuous toolbar, no extra header strip */
          <div className="nxWorkbookActions nx-rise-in-sm" data-testid="workbook-actions">
            {showIO && <WorkbookIO controller={ioController} baseName={valueRef.current?.name ?? "workbook"} />}
            {actions}
          </div>
        )}
        {phase === "loading" && (
          <div className="nxWorkbookOverlay nxWorkbookOverlay--loading nxWorkbookOverlay--transparent" data-testid="workbook-loading">
            <span className="nxWorkbookOverlayBody">Loading workbook…</span>
          </div>
        )}
        {phase === "error" && (
          <div className="nxWorkbookOverlay" data-testid="workbook-error" role="alert">
            <span className="nxWorkbookOverlayTitle">Couldn’t open the workbook</span>
            <span className="nxWorkbookOverlayBody">The saved workbook could not be loaded. Reset it to start fresh.</span>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkbookSurface;
