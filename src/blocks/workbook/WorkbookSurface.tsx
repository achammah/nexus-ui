// adapted from Univer (@univerjs, Apache-2.0) — mounts the published preset as a
// standalone app-shell; no source is lifted, the engine is a pinned dependency.
import * as React from "react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { defaultTheme } from "@univerjs/themes";
import { CommandType, ThemeService, type IWorkbookData } from "@univerjs/core";
import "@univerjs/preset-sheets-core/lib/index.css";
import "./workbook.css";
import { deriveWorkbookTheme, isDarkTheme, skinSignature, themeSignature, useThemeNonce, withLightTokens, type UniverTheme } from "./workbook-theme";
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
  "data-testid"?: string;
}

type Injector = { get: (token: unknown) => unknown };
type UniverInstance = {
  univer: { dispose: () => void; __getInjector: () => Injector };
  univerAPI: UniverApi;
};
interface FWorkbook { save: () => IWorkbookData }
interface UniverApi {
  createWorkbook: (data: IWorkbookData) => void;
  getActiveWorkbook: () => FWorkbook | null;
  toggleDarkMode: (isDark: boolean) => void;
  onCommandExecuted: (cb: (command: { type: number; id: string }) => void) => { dispose: () => void };
}
interface UniverThemeService {
  setTheme: (theme: unknown) => void;
  setDarkMode: (dark: boolean) => void;
}

/* Builds the light-anchored theme from the live tokens. Univer's canvas derives its
   dark rendering by inverting this palette, and its DOM chrome gets the exact
   per-mode values from workbook.css — so ONE light-anchored object serves both. */
const derive = () =>
  withLightTokens((resolve) => deriveWorkbookTheme(defaultTheme as unknown as UniverTheme, resolve));

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
  ...rest
}: WorkbookSurfaceProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const apiRef = React.useRef<UniverApi | null>(null);
  const themeRef = React.useRef<UniverThemeService | null>(null);
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
    try {
      const sig = themeSignature();
      const skinSig = skinSignature();
      const created = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS) },
        theme: derive() as unknown as typeof defaultTheme,
        presets: [UniverSheetsCorePreset({ container: host, ribbonType: "simple" })],
      }) as unknown as UniverInstance;
      instance = created;
      apiRef.current = created.univerAPI;
      themeRef.current = created.univer.__getInjector().get(ThemeService) as UniverThemeService;
      appliedSigRef.current = sig;
      appliedSkinRef.current = skinSig;
      created.univerAPI.createWorkbook(valueRef.current ?? seedWorkbook());
      created.univerAPI.toggleDarkMode(isDarkTheme());
      // persist on data-changing commands only (mutations), not selection/scroll
      cmdSub = created.univerAPI.onCommandExecuted((command) => {
        if (command.type !== CommandType.MUTATION) return;
        const fWorkbook = created.univerAPI.getActiveWorkbook();
        if (fWorkbook) onChangeRef.current?.(fWorkbook.save());
      });
      setPhase("ready");
    } catch {
      setPhase("error");
    }
    return () => {
      cmdSub?.dispose();
      try { instance?.univer.dispose(); } catch { /* already gone */ }
      apiRef.current = null;
      themeRef.current = null;
      if (host) host.innerHTML = "";
    };
  }, [reloadNonce]);

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
    }
    const dark = isDarkTheme();
    themeService.setDarkMode(dark);
    api.toggleDarkMode(dark);
    // a theme/skin write can land while this pass runs (its observer bump is
    // already queued): if the inputs moved, drop the stored signatures so the
    // queued pass re-applies instead of exiting on a stale match
    if (themeSignature() !== sig) { appliedSigRef.current = ""; appliedSkinRef.current = ""; }
  }, [nonce, phase]);

  return (
    <div
      className={[
        "nxWorkbook",
        actions ? "nxWorkbook--hostActions" : "",
        phase === "error" ? "nxWorkbookError" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      <div className="nxWorkbookHost">
        {/* Univer owns this div exclusively — no React children here, or React and
            Univer fight over the same nodes (removeChild). Overlays are siblings. */}
        <div className="nxWorkbookMount" ref={hostRef} data-testid="workbook-host" aria-label="Spreadsheet workbook" role="application" />
        {actions && phase === "ready" && (
          /* host actions live INSIDE the vendor toolbar band (its right end stays
             clear via a reserved inset in workbook.css) — one continuous toolbar,
             no extra header strip */
          <div className="nxWorkbookActions nx-rise-in-sm" data-testid="workbook-actions">{actions}</div>
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
