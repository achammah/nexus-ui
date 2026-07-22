import * as React from "react";
import { createRoot } from "react-dom/client";
import "@/tokens/tokens.css";
import "@/record-core/record-core.css";
import "@/primitives/primitives.css";
import { getViewDefinition } from "@/record-core/views/registry";
import { configuredViewsFor } from "@/record-core/views/resolve";
import { groupableFields } from "@/record-core/views/group";
import { FilterBar, FilterChips, filterableFields, matchFilters, type FilterCond } from "@/record-core/Filters";
import { activeFields } from "@/record-core/options";
import type { RecordRow } from "@/record-core/types";
import { rollRecurrencePatch, seedTasks, SEED_TASK_LABELS, SEED_TASK_USERS, taskObjectConfig } from "@/record-core/tasks";

/* Local harness — hosts the registry views over the seed store, mirroring what
   the starter's list surface provides (rows after search+filters, view-state
   bag, bulk bar, saved views). Dev-only, untracked. */

const object = taskObjectConfig({ labels: SEED_TASK_LABELS });
const users = SEED_TASK_USERS;

type SavedView = { id: string; name: string; filters: FilterCond[]; search: string; viewType: string; state: Record<string, unknown> };

function App() {
  const [rows, setRows] = React.useState<RecordRow[]>(() => seedTasks());
  const [viewType, setViewType] = React.useState(object.defaultView as string);
  const [viewState, setViewState] = React.useState<Record<string, unknown>>({});
  const [selection, setSelection] = React.useState<Record<string, boolean>>({});
  const [filters, setFilters] = React.useState<FilterCond[]>([]);
  const [search, setSearch] = React.useState("");
  const [saved, setSaved] = React.useState<SavedView[]>([]);
  const [dark, setDark] = React.useState(false);
  const [mobile, setMobile] = React.useState(false);
  const [peek, setPeek] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  const onPatch = (id: string, patch: Record<string, unknown>) => {
    setRows((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      // recurring: completing a repeat task rolls it forward (host-side rule)
      const next = { ...r, ...patch };
      if (patch.status === "Done" && String(r.repeat ?? "None") !== "None") {
        const roll = rollRecurrencePatch(next, { resetStatus: "Todo" });
        if (roll) return { ...next, ...roll };
      }
      return next;
    }));
  };
  const onCreate = async (body: Record<string, unknown>): Promise<RecordRow> => {
    const row: RecordRow = { id: `new-${Math.random().toString(36).slice(2, 7)}`, labels: [], blockedBy: [], parent: null, repeat: "None", progress: 0, ...body };
    setRows((rs) => [...rs, row]);
    return row;
  };
  const onDelete = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const ff = filterableFields(activeFields(object.fields));
  const shown = rows.filter((r) =>
    matchFilters(r, filters) &&
    (!search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())),
  );

  const tabs = configuredViewsFor(object, groupableFields(object));
  const active = tabs.find((t) => t.type === viewType) ?? tabs[0];
  const def = getViewDefinition(active.type);
  const cfg = { ...(def?.defaultConfig?.(object) ?? {}), ...active };
  const err = def?.validateConfig?.(object, cfg);
  const selCount = Object.values(selection).filter(Boolean).length;
  const selIds = Object.keys(selection).filter((k) => selection[k]);
  const bulk = (patch: Record<string, unknown>) => { selIds.forEach((id) => onPatch(id, patch)); setSelection({}); };

  const applySaved = (v: SavedView) => { setFilters(v.filters); setSearch(v.search); setViewType(v.viewType); setViewState(v.state); };

  const vp: import("@/record-core/views/types").ViewProps = {
    object, rows: shown, users, readOnly: false,
    viewConfig: cfg, viewState, onViewState: (p) => setViewState((s) => ({ ...s, ...p })),
    onOpen: (id) => setPeek(id), onPeek: (id) => setPeek(id), onPatch,
    onCreateDraft: (prefill) => void onCreate({ title: "New task", ...prefill }),
    selection, onSelectionChange: setSelection, onCreate, onDelete,
  };

  return (
    <div style={{ padding: 16, maxWidth: mobile ? 390 : undefined, margin: "0 auto", fontFamily: "var(--nx-font-sans)", background: "var(--nx-bg)", minHeight: "100vh", color: "var(--nx-fg)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <strong>{object.label}</strong>
        <span className="nxSeg">
          {tabs.map((t) => {
            const d = getViewDefinition(t.type);
            return (
              <button key={t.type} type="button" className="nxSegBtn" data-active={active.type === t.type} data-testid={`tab-${t.type}`} onClick={() => setViewType(t.type)}>
                {d?.label ?? t.type}
              </button>
            );
          })}
        </span>
        {def?.Toolbar && <def.Toolbar object={object} users={users} viewConfig={cfg} viewState={viewState} onViewState={(p) => setViewState((s) => ({ ...s, ...p }))} side="trail" />}
        <button type="button" data-testid="save-view" onClick={() => {
          const name = prompt("View name?") ?? "";
          if (name) setSaved((s) => [...s, { id: String(Date.now()), name, filters, search, viewType: active.type, state: viewState }]);
        }}>Save view</button>
        {saved.map((v) => (
          <button key={v.id} type="button" data-testid={`saved-${v.name}`} onClick={() => applySaved(v)}>★ {v.name}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="toggle-mobile" onClick={() => setMobile(!mobile)}>{mobile ? "desktop" : "mobile"}</button>
        <button type="button" data-testid="toggle-theme" onClick={() => setDark(!dark)}>{dark ? "light" : "dark"}</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <FilterBar fields={ff} value={filters} onChange={setFilters} search={search} onSearch={setSearch} />
        <FilterChips fields={ff} value={filters} onChange={setFilters} />
      </div>
      {selCount > 0 && (
        <div data-testid="bulk-bar" style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", marginBottom: 8, border: "1px solid var(--nx-border)", borderRadius: 8, background: "var(--nx-accent-soft)" }}>
          <strong>{selCount} selected</strong>
          <button type="button" data-testid="bulk-done" onClick={() => bulk({ status: "Done" })}>Mark done</button>
          <button type="button" data-testid="bulk-assign" onClick={() => bulk({ assignee: users[0] })}>Assign {users[0]}</button>
          <button type="button" data-testid="bulk-clear" onClick={() => setSelection({})}>Clear</button>
        </div>
      )}
      {err ? <div>{err}</div> : def ? (
        <React.Suspense fallback={<div style={{ padding: 30 }}>Loading…</div>}>
          <def.component {...vp} />
        </React.Suspense>
      ) : <div>no view “{active.type}”</div>}
      {peek && (
        <div data-testid="peek" style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 320, background: "var(--nx-bg-raised)", borderLeft: "1px solid var(--nx-border)", padding: 16, overflow: "auto", zIndex: 10 }}>
          <button type="button" onClick={() => setPeek(null)}>close</button>
          <pre style={{ whiteSpace: "pre-wrap", font: "var(--nx-text-micro)" }}>{JSON.stringify(rows.find((r) => r.id === peek), null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
