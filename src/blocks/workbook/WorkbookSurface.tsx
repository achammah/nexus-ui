// adapted from Univer (@univerjs, Apache-2.0) — mounts the published preset as a
// standalone app-shell; no source is lifted, the engine is a pinned dependency.
import * as React from "react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { defaultTheme } from "@univerjs/themes";
import { CommandType, type IWorkbookData } from "@univerjs/core";
import "@univerjs/preset-sheets-core/lib/index.css";
import "./workbook.css";
import { deriveWorkbookTheme, isDarkTheme, resolveCssColor, useThemeNonce, type UniverTheme } from "./workbook-theme";
import { seedWorkbook } from "./snapshot";

export interface WorkbookSurfaceProps {
  /* the workbook to load; null seeds the demo workbook */
  value: IWorkbookData | null;
  /* fired on every persisted change (data/insert/format/merge) — the host debounces */
  onChange?: (snapshot: IWorkbookData) => void;
  /* bump to force a fresh mount from the current `value` (reset, external reload) */
  reloadNonce?: number;
  className?: string;
  /* status-bar title (host supplies i18n copy) */
  title?: React.ReactNode;
  /* trailing status-bar controls (host renders the reset affordance here) */
  actions?: React.ReactNode;
  "data-testid"?: string;
}

type UniverInstance = { univer: { dispose: () => void }; univerAPI: UniverApi };
interface FWorkbook { save: () => IWorkbookData }
interface UniverApi {
  createWorkbook: (data: IWorkbookData) => void;
  getActiveWorkbook: () => FWorkbook | null;
  toggleDarkMode: (isDark: boolean) => void;
  onCommandExecuted: (cb: (command: { type: number; id: string }) => void) => { dispose: () => void };
}

/* WorkbookSurface — a full Univer workbook (formula bar, 400+ functions, insert
   rows/cols, formatting, multi-sheet, freeze/merge) mounted into a container. It is
   free-surface: the host owns the snapshot (load/persist through the app store); this
   component owns the Univer lifecycle, the token->accent theme, the dark-mode sync,
   and the change stream. StrictMode-safe: one instance, fully disposed on cleanup. */
export function WorkbookSurface({
  value,
  onChange,
  reloadNonce = 0,
  className,
  title,
  actions,
  ...rest
}: WorkbookSurfaceProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const apiRef = React.useRef<UniverApi | null>(null);
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
      const created = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS) },
        theme: deriveWorkbookTheme(defaultTheme as unknown as UniverTheme, resolveCssColor) as unknown as typeof defaultTheme,
        presets: [UniverSheetsCorePreset({ container: host })],
      }) as unknown as UniverInstance;
      instance = created;
      apiRef.current = created.univerAPI;
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
      if (host) host.innerHTML = "";
    };
  }, [reloadNonce]);

  // re-sync Univer's canvas dark mode when the app theme flips (data-theme) or a skin
  // lands. The chrome accent + surfaces re-derive for free through the --univer-*
  // overrides in workbook.css (pure CSS cascade); the canvas accent scale is set once
  // at mount (Univer's public facade exposes no post-mount setTheme).
  React.useEffect(() => {
    const api = apiRef.current;
    if (!api || phase !== "ready") return;
    api.toggleDarkMode(isDarkTheme());
  }, [nonce, phase]);

  return (
    <div className={["nxWorkbook", phase === "error" ? "nxWorkbookError" : "", className].filter(Boolean).join(" ")} {...rest}>
      {(title || actions) && (
        <div className="nxWorkbookBar">
          {title && <span className="nxWorkbookBarTitle">{title}</span>}
          <span className="nxWorkbookBarSpacer" />
          {actions}
        </div>
      )}
      <div className="nxWorkbookHost">
        {/* Univer owns this div exclusively — no React children here, or React and
            Univer fight over the same nodes (removeChild). Overlays are siblings. */}
        <div className="nxWorkbookMount" ref={hostRef} data-testid="workbook-host" aria-label="Spreadsheet workbook" role="application" />
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
