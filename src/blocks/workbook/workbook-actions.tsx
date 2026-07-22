// Import/Export controls for the workbook — the headline of the feature depth. They
// ride the workbook's own toolbar band (right of any host actions), in the app's icon
// language (lucide), and drive exceljs through the lazy xlsx-io bridge. IMPORT is an
// inbound action that REPLACES the current workbook, so it always routes through a
// confirm dialog (unsaved work is at stake) and reports a result; EXPORT downloads a
// file and reports what it wrote. Both surface a busy state and a transient status.
import * as React from "react";
import { Download, Upload, FileSpreadsheet, FileText } from "lucide-react";
import type { IWorkbookData } from "@univerjs/core";
import { Menu } from "../../primitives/overlays";
import {
  exportWorkbookToXlsx, importXlsxToWorkbook, exportSheetToCsv, importCsvToWorkbook, triggerDownload,
} from "./xlsx-io";

/* Toolbar-native ghost button. forwardRef so the Radix menu trigger (asChild) can
   attach its ref to a real DOM button — a plain function component here would trip
   React's "cannot be given refs" warning. Icon-left + label, matching the reskin. */
const IOButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; busy?: boolean }>(
  function IOButton({ icon, busy, children, ...rest }, ref) {
    return (
      <button ref={ref} type="button" className="nxWorkbookIOBtn" {...rest}>
        {busy ? <span className="nxSpin" aria-hidden /> : icon}
        {children}
      </button>
    );
  },
);

export interface WorkbookIOController {
  /* the current workbook snapshot (IWorkbookData) — null while the engine is not ready */
  getSnapshot: () => IWorkbookData | null;
  /* replace the live workbook with imported data (disposes the current unit, mounts the new) */
  replaceWorkbook: (data: IWorkbookData) => void;
  /* the active sheet id, for a single-sheet CSV export */
  getActiveSheetId: () => string | undefined;
}

type Busy = null | "import" | "export";
type Status = { kind: "ok" | "err"; msg: string } | null;

const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export function WorkbookIO({
  controller,
  baseName = "workbook",
}: {
  controller: WorkbookIOController;
  baseName?: string;
}) {
  const [busy, setBusy] = React.useState<Busy>(null);
  const [status, setStatus] = React.useState<Status>(null);
  const [pending, setPending] = React.useState<File | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 4500);
    return () => clearTimeout(t);
  }, [status]);

  const safeName = (baseName || "workbook").replace(/[^\w.-]+/g, "_") || "workbook";

  async function doExport(fmt: "xlsx" | "csv") {
    const snap = controller.getSnapshot();
    if (!snap) { setStatus({ kind: "err", msg: "Workbook not ready" }); return; }
    setBusy("export");
    try {
      if (fmt === "xlsx") {
        const blob = await exportWorkbookToXlsx(snap);
        triggerDownload(blob, `${safeName}.xlsx`);
        setStatus({ kind: "ok", msg: `Exported ${safeName}.xlsx` });
      } else {
        const csv = exportSheetToCsv(snap, controller.getActiveSheetId());
        triggerDownload(csv, `${safeName}.csv`, "text/csv");
        setStatus({ kind: "ok", msg: `Exported ${safeName}.csv` });
      }
    } catch (e) {
      setStatus({ kind: "err", msg: "Export failed: " + errMsg(e) });
    } finally { setBusy(null); }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (f) setPending(f);
  }

  async function confirmImport() {
    const file = pending;
    setPending(null);
    if (!file) return;
    setBusy("import");
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      let data: IWorkbookData;
      if (isCsv) {
        data = importCsvToWorkbook(await file.text(), file.name.replace(/\.csv$/i, ""));
      } else {
        data = await importXlsxToWorkbook(await file.arrayBuffer());
      }
      controller.replaceWorkbook(data);
      const n = data.sheetOrder?.length ?? 0;
      setStatus({ kind: "ok", msg: `Imported ${file.name} (${n} sheet${n === 1 ? "" : "s"})` });
    } catch (e) {
      setStatus({ kind: "err", msg: "Import failed: " + errMsg(e) });
    } finally { setBusy(null); }
  }

  // IMPORT replaces the workbook (destructive to unsaved work), so a file pick opens
  // an inline confirm strip in the toolbar band — lighter than a modal for a toolbar
  // action, and dependency-free (no vendored overlay). Escape cancels.
  if (pending) {
    return (
      <div className="nxWorkbookIO nxWorkbookIO--confirm" data-testid="workbook-io-confirm" role="group" aria-label="Confirm import"
        onKeyDown={(e) => { if (e.key === "Escape") setPending(null); }}>
        <span className="nxWorkbookIOConfirmText">Replace workbook with <strong>{pending.name}</strong>?</span>
        <button type="button" className="nxWorkbookIOBtn nxWorkbookIOBtn--primary" onClick={confirmImport} data-testid="workbook-import-confirm" autoFocus>
          Replace
        </button>
        <button type="button" className="nxWorkbookIOBtn" onClick={() => setPending(null)}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="nxWorkbookIO" data-testid="workbook-io">
      <Menu
        trigger={
          <IOButton icon={<Download aria-hidden />} busy={busy === "export"} data-testid="workbook-export" aria-label="Export workbook">
            <span className="nxWorkbookIOLabel">Export</span>
          </IOButton>
        }
        items={[
          { key: "xlsx", label: <span className="nxWorkbookIOItem"><FileSpreadsheet aria-hidden size={15} /> Excel (.xlsx)</span>, onSelect: () => doExport("xlsx") },
          { key: "csv", label: <span className="nxWorkbookIOItem"><FileText aria-hidden size={15} /> CSV (.csv)</span>, onSelect: () => doExport("csv") },
        ]}
      />
      <IOButton icon={<Upload aria-hidden />} busy={busy === "import"} onClick={() => fileRef.current?.click()} data-testid="workbook-import" aria-label="Import a spreadsheet file">
        <span className="nxWorkbookIOLabel">Import</span>
      </IOButton>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFileChosen} data-testid="workbook-import-input" />

      {status && (
        <span className="nxWorkbookIOStatus" data-kind={status.kind} role="status" data-testid="workbook-io-status">
          {status.msg}
        </span>
      )}
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
