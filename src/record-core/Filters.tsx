import * as React from "react";
import { X, ChevronDown, ChevronLeft, Search, CornerDownLeft, Type as TypeIcon, Hash, Calendar, User, Tag } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";

/* Advanced filter — a COMMAND-style builder AND the object's primary search box in
   one. The add affordance is an always-present input (no "+ Filter" gate): type a
   value and it both searches free-text and suggests complete filters ("Status is
   Active", "Owner contains alex"); type a field name to browse it. Fully keyboard-
   driven. Active filters render as removable chips you can still tweak in place. */

export type FilterField = { key: string; label: string; type: string; options?: unknown[] };
export type FilterCond = { id: string; field: string; op: string; value: string };

/* Map an object's fields to the ones a FilterBar can operate on: everything except
   free-form json + relation types (which have no meaningful operator set). Feed the
   result to <FilterBar fields=…> / <FilterChips fields=…>. */
export function filterableFields(
  fields: Array<{ key: string; label: string; type: string; options?: unknown[] }>,
): FilterField[] {
  return fields
    .filter((f) => !["json", "relation"].includes(f.type))
    .map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }));
}

type Op = { v: string; label: string; noValue?: boolean };
const OPS_TEXT: Op[] = [
  { v: "contains", label: "contains" }, { v: "notContains", label: "does not contain" },
  { v: "is", label: "is" }, { v: "isNot", label: "is not" },
  { v: "empty", label: "is empty", noValue: true }, { v: "notEmpty", label: "is not empty", noValue: true },
];
const OPS_SELECT: Op[] = [{ v: "is", label: "is" }, { v: "isNot", label: "is not" }, { v: "empty", label: "is empty", noValue: true }];
const OPS_NUM: Op[] = [{ v: "eq", label: "=" }, { v: "gt", label: ">" }, { v: "lt", label: "<" }];
const OPS_DATE: Op[] = [{ v: "is", label: "is" }, { v: "before", label: "before" }, { v: "after", label: "after" }];

export function opsFor(type: string): Op[] {
  if (type === "select" || type === "user" || type === "multiselect") return OPS_SELECT;
  if (type === "number" || type === "money" || type === "rating") return OPS_NUM;
  if (type === "date" || type === "dateTime") return OPS_DATE;
  return OPS_TEXT;
}
const opLabel = (type: string, op: string) => opsFor(type).find((o) => o.v === op)?.label ?? op;
const optionValues = (f?: FilterField): string[] =>
  (f?.options ?? []).map((o) => (typeof o === "string" ? o : (o as { value: string }).value)).filter(Boolean);

/* apply all conditions (AND) to a row */
export function matchFilters(row: Record<string, unknown>, filters: FilterCond[]): boolean {
  return filters.every((f) => {
    if (!f.field) return true;
    const raw = row[f.field];
    const s = String(raw ?? "").toLowerCase();
    const val = String(f.value ?? "").toLowerCase();
    switch (f.op) {
      case "contains": return s.includes(val);
      case "notContains": return !s.includes(val);
      case "is": return s === val;
      case "isNot": return s !== val;
      case "empty": return !s.trim();
      case "notEmpty": return !!s.trim();
      case "eq": return Number(raw) === Number(f.value);
      case "gt": return Number(raw) > Number(f.value);
      case "lt": return Number(raw) < Number(f.value);
      case "before": return !!f.value && new Date(String(raw)) < new Date(f.value);
      case "after": return !!f.value && new Date(String(raw)) > new Date(f.value);
      default: return true;
    }
  });
}

/* ---- command-filter helpers ---- */
type OptItem = { value: string; label: string };
const optionList = (f?: FilterField): OptItem[] =>
  (f?.options ?? [])
    .map((o) => (typeof o === "string" ? { value: o, label: o } : { value: (o as { value: string }).value, label: (o as { value: string; label?: string }).label ?? (o as { value: string }).value }))
    .filter((o) => o.value != null && o.value !== "");
const hasOptions = (f: FilterField) => f.type === "select" || f.type === "multiselect" || f.type === "user" || optionList(f).length > 0;
const fieldIcon = (t: string) =>
  t === "select" || t === "multiselect" ? <Tag size={13} /> :
  t === "user" ? <User size={13} /> :
  t === "number" || t === "money" || t === "rating" ? <Hash size={13} /> :
  t === "date" || t === "dateTime" ? <Calendar size={13} /> : <TypeIcon size={13} />;
/* highlight the matched substring in a label */
function mark(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="flt-hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

let _n = 0;
const fid = () => `f${Date.now().toString(36)}${(_n++).toString(36)}`;

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
const DATEISH_RE = /^\d{4}(-\d{1,2}(-\d{1,2})?)?$|^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/;

type Sug =
  | { key: string; kind: "value"; field: FilterField; op: string; value: string; label: string }
  | { key: string; kind: "apply"; field: FilterField; op: string; opText: string; value: string }
  | { key: string; kind: "field"; field: FilterField };

/* the ONE field: free text live-searches the rows AND, in the same dropdown, offers
   the string as a filter on any compatible field/condition in one go. */
function FilterCommand({ fields, onAdd, onRemoveLast, hasFilters, search, onSearch, searchTestId }: {
  fields: FilterField[]; onAdd: (field: FilterField, op: string, value: string) => void; onRemoveLast: () => void;
  hasFilters: boolean; search: string; onSearch: (s: string) => void;
  /* override the search input's data-testid (defaults to "filter-command") so a host can keep a legacy search hook on this same input */
  searchTestId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [pick, setPick] = React.useState<FilterField | null>(null); // browsing one field's values
  const [pickQ, setPickQ] = React.useState("");                     // local text while browsing (not the row search)
  const [pickOp, setPickOp] = React.useState("");
  const [pickVal, setPickVal] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());
  const q = pick ? pickQ : (search ?? "");

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setPick(null); setPickQ(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  /* one typed string → every field/condition it could apply to */
  const suggestions: Sug[] = React.useMemo(() => {
    const raw = (search ?? "").trim();
    const ql = raw.toLowerCase();
    const out: Sug[] = [];
    if (!ql) { for (const f of fields) out.push({ key: "f:" + f.key, kind: "field", field: f }); return out; }
    // 1) option-value matches → "Field is <Value>"
    for (const f of fields) for (const o of optionList(f)) if (o.label.toLowerCase().includes(ql)) out.push({ key: "v:" + f.key + ":" + o.value, kind: "value", field: f, op: "is", value: o.value, label: o.label });
    // 2) apply the string to each compatible field, with the ops that fit its type
    for (const f of fields) {
      if (hasOptions(f)) continue;
      const t = f.type;
      if (["number", "money", "rating"].includes(t)) {
        if (NUMERIC_RE.test(ql)) for (const op of ["eq", "gt", "lt"]) out.push({ key: `a:${f.key}:${op}`, kind: "apply", field: f, op, opText: opLabel(t, op), value: raw });
      } else if (["date", "dateTime"].includes(t)) {
        if (DATEISH_RE.test(ql)) for (const op of ["is", "before", "after"]) out.push({ key: `a:${f.key}:${op}`, kind: "apply", field: f, op, opText: opLabel(t, op), value: raw });
      } else if (t !== "boolean") {
        out.push({ key: `a:${f.key}:contains`, kind: "apply", field: f, op: "contains", opText: "contains", value: raw });
      }
    }
    // 3) field-name matches → browse that field
    for (const f of fields) if (f.label.toLowerCase().includes(ql)) out.push({ key: "f:" + f.key, kind: "field", field: f });
    return out;
  }, [search, fields]);

  const pickOptions: OptItem[] = React.useMemo(() => {
    if (!pick) return [];
    const ql = pickQ.trim().toLowerCase();
    return optionList(pick).filter((o) => !ql || o.label.toLowerCase().includes(ql));
  }, [pick, pickQ]);

  const rowsLen = pick ? (hasOptions(pick) ? pickOptions.length : 0) : suggestions.length;
  React.useEffect(() => { setActive(0); }, [q, pick]);

  function reset() { onSearch(""); setPick(null); setPickQ(""); setActive(0); setOpen(true); focusInput(); }
  function openField(f: FilterField) { setPick(f); setPickQ(""); setPickOp(opsFor(f.type)[0].v); setPickVal(""); focusInput(); }
  function applyValue(f: FilterField, value: string) { onAdd(f, "is", value); reset(); }
  function applyCond(f: FilterField, op: string, value: string) { onAdd(f, op, value); reset(); }
  function applyPickForm() {
    if (!pick) return;
    const noVal = opsFor(pick.type).find((o) => o.v === pickOp)?.noValue;
    if (!noVal && !pickVal.trim()) return;
    onAdd(pick, pickOp, noVal ? "" : pickVal.trim()); reset();
  }
  function applySug(s: Sug) {
    if (s.kind === "value") applyValue(s.field, s.value);
    else if (s.kind === "apply") applyCond(s.field, s.op, s.value);
    else openField(s.field);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, rowsLen - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (pick) { if (hasOptions(pick)) { const o = pickOptions[active]; if (o) applyValue(pick, o.value); } else applyPickForm(); }
      else { const s = suggestions[active]; if (s) applySug(s); }
    } else if (e.key === "Escape") { e.preventDefault(); if (pick) { setPick(null); setPickQ(""); focusInput(); } else { setOpen(false); inputRef.current?.blur(); } }
    else if (e.key === "Backspace" && q === "" && !pick && hasFilters) { onRemoveLast(); }
  }

  const placeholder = pick ? (hasOptions(pick) ? `${pick.label} is…` : `${pick.label}…`) : "Search or filter…";
  const pickForm = pick && !hasOptions(pick);

  return (
    <div className="flt-cmd" ref={wrapRef}>
      <span className="flt-cmd-ic">{pick ? fieldIcon(pick.type) : <Search size={13} />}</span>
      {pick && <button className="flt-cmd-crumb" onClick={() => { setPick(null); setPickQ(""); focusInput(); }}><ChevronLeft size={11} />{pick.label}</button>}
      <input
        ref={inputRef} className="flt-cmd-input" data-testid={searchTestId ?? "filter-command"} value={q} placeholder={placeholder}
        onFocus={() => setOpen(true)} onChange={(e) => { pick ? setPickQ(e.target.value) : onSearch(e.target.value); setOpen(true); }} onKeyDown={onKey}
      />
      {open && (
        <div className="flt-pop" role="listbox">
          {pickForm ? (
            <div className="flt-pick-form">
              <div className="flt-pick-lbl">{fieldIcon(pick!.type)} {pick!.label}</div>
              <div className="flt-pick-row">
                <select className="flt-pick-op" value={pickOp} onChange={(e) => setPickOp(e.target.value)}>
                  {opsFor(pick!.type).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
                {!opsFor(pick!.type).find((o) => o.v === pickOp)?.noValue && (
                  <input autoFocus className="flt-pick-val" data-testid="filter-pick-value" value={pickVal} placeholder={pick!.type === "date" ? "yyyy-mm-dd" : "value…"}
                    onChange={(e) => setPickVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPickForm(); } }} />
                )}
                <button className="flt-pick-go" data-testid="filter-pick-apply" aria-label="Apply" onClick={applyPickForm}><CornerDownLeft size={13} /></button>
              </div>
            </div>
          ) : pick ? (
            <div className="flt-pop-list">
              {pickOptions.length === 0 && <div className="flt-empty">No matching value</div>}
              {pickOptions.map((o, i) => (
                <button key={o.value} className={`flt-sug${i === active ? " is-active" : ""}`} data-testid={`filter-opt-${o.value}`} onMouseMove={() => setActive(i)} onClick={() => applyValue(pick!, o.value)}>
                  <span className="flt-sug-ic">{fieldIcon(pick!.type)}</span>
                  <span className="flt-sug-main"><span className="flt-sug-f">{pick!.label}</span><span className="flt-sug-op">is</span><b>{mark(o.label, pickQ)}</b></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flt-pop-list">
              {suggestions.length === 0 && <div className="flt-empty">Nothing matches &ldquo;{q}&rdquo;</div>}
              {suggestions.map((s, i) => (
                <button key={s.key} className={`flt-sug${i === active ? " is-active" : ""}`} data-testid={`filter-sug-${s.kind}-${s.field.key}`} onMouseMove={() => setActive(i)} onClick={() => applySug(s)}>
                  <span className="flt-sug-ic">{fieldIcon(s.field.type)}</span>
                  {s.kind === "value" ? (
                    <span className="flt-sug-main"><span className="flt-sug-f">{s.field.label}</span><span className="flt-sug-op">is</span><b>{mark(s.label, q)}</b></span>
                  ) : s.kind === "apply" ? (
                    <span className="flt-sug-main"><span className="flt-sug-f">{s.field.label}</span><span className="flt-sug-op">{s.opText}</span><b>{s.op === "contains" ? <>&ldquo;{s.value}&rdquo;</> : s.value}</b></span>
                  ) : (
                    <><span className="flt-sug-main">Filter by <span className="flt-sug-f">{mark(s.field.label, q)}</span></span><span className="flt-sug-go">&rsaquo;</span></>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="flt-pop-foot"><span><kbd>↑↓</kbd> move</span><span><kbd>↵</kbd> {pick ? "add" : "apply"}</span><span><kbd>esc</kbd> {pick ? "back" : "close"}</span></div>
        </div>
      )}
    </div>
  );
}

/* the toolbar field — just the command input; active filters live on their own row
   (FilterChips) so adding a filter never shoves the search bar around. */
export function FilterBar({ fields, value, onChange, search, onSearch, searchTestId }: { fields: FilterField[]; value: FilterCond[]; onChange: (f: FilterCond[]) => void; search: string; onSearch: (s: string) => void; /* forwarded to the search input's data-testid (defaults to "filter-command") */ searchTestId?: string }) {
  return (
    <div className="flt-bar" data-testid="filter-bar">
      <FilterCommand
        fields={fields}
        hasFilters={value.length > 0}
        search={search}
        onSearch={onSearch}
        searchTestId={searchTestId}
        onAdd={(field, op, val) => onChange([...value, { id: fid(), field: field.key, op, value: val }])}
        onRemoveLast={() => onChange(value.slice(0, -1))}
      />
      <style>{FLT_CSS}</style>
    </div>
  );
}

/* active-filter chips — a separate row placed BETWEEN the search bar and the table.
   Each chip still lets you tweak field/op/value in place, or remove it. */
export function FilterChips({ fields, value, onChange }: { fields: FilterField[]; value: FilterCond[]; onChange: (f: FilterCond[]) => void }) {
  const fieldMap = React.useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);
  const set = (id: string, patch: Partial<FilterCond>) => onChange(value.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => onChange(value.filter((f) => f.id !== id));
  if (!value.length) return null;
  return (
    <div className="flt-chips" data-testid="filter-chips">
      {value.map((f) => {
        const field = fieldMap[f.field];
        const type = field?.type ?? "text";
        const ops = opsFor(type);
        const noValue = ops.find((o) => o.v === f.op)?.noValue;
        const opts = optionValues(field);
        return (
          <span className="flt-chip" key={f.id} data-testid={`filter-chip-${f.field}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="flt-seg flt-field">{field?.label ?? f.field}<ChevronDown size={10} /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="flt-menu">
                {fields.map((ff) => <DropdownMenuItem key={ff.key} onSelect={() => set(f.id, { field: ff.key, op: opsFor(ff.type)[0].v, value: "" })}>{ff.label}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="flt-seg flt-op">{opLabel(type, f.op)}<ChevronDown size={10} /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="flt-menu">
                {ops.map((o) => <DropdownMenuItem key={o.v} onSelect={() => set(f.id, { op: o.v, value: o.noValue ? "" : f.value })}>{o.label}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            {!noValue && (opts.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button className="flt-seg flt-val">{f.value || "select…"}<ChevronDown size={10} /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="flt-menu">
                  {opts.map((v) => <DropdownMenuItem key={v} onSelect={() => set(f.id, { value: v })}>{v}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <input className="flt-seg flt-input" data-testid={`filter-value-${f.field}`} value={f.value} placeholder={type === "date" ? "yyyy-mm-dd" : "value…"}
                onChange={(e) => set(f.id, { value: e.target.value })} />
            ))}
            <button className="flt-x" aria-label="Remove filter" data-testid={`filter-remove-${f.field}`} onClick={() => remove(f.id)}><X size={11} /></button>
          </span>
        );
      })}
      <button className="flt-clear" data-testid="filter-clear" onClick={() => onChange([])}>clear all</button>
    </div>
  );
}

const FLT_CSS = `
.flt-bar{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
/* active-filter chips row — its own line between the search bar and the table */
.flt-chips{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:11px 0 1px}
.flt-chip{display:inline-flex;align-items:stretch;border:1px solid var(--nx-border-strong);background:var(--nx-bg-raised);box-shadow:var(--nx-shadow-1);animation:fltChipIn .2s var(--nx-ease-settle)}
@keyframes fltChipIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.flt-seg{display:inline-flex;align-items:center;gap:4px;font-size:12px;background:none;border:0;border-right:1px solid var(--nx-border);padding:5px 9px;cursor:pointer;color:var(--nx-fg);white-space:nowrap}
.flt-field{font-family:var(--nx-font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--nx-accent)}
.flt-op{color:var(--nx-fg-muted);font-style:italic}
.flt-val,.flt-input{font-weight:600}
.flt-input{outline:none;max-width:120px;border-right:1px solid var(--nx-border)}
.flt-seg:hover{background:var(--nx-bg-sunken)}
.flt-x{display:grid;place-items:center;background:none;border:0;padding:0 8px;cursor:pointer;color:var(--nx-fg-faint)}
.flt-x:hover{color:var(--nx-danger)}
.flt-clear{font-family:var(--nx-font-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--nx-fg-faint);background:none;border:0;cursor:pointer;padding:4px}
.flt-clear:hover{color:var(--nx-danger)}
.flt-menu{max-height:280px;overflow:auto}

/* command filter */
.flt-cmd{position:relative;display:inline-flex;align-items:center;gap:7px;flex:1;min-width:220px;max-width:440px;height:34px;
  border:1px solid var(--nx-border);background:var(--nx-bg);padding:0 9px}
.flt-cmd:focus-within{border-color:var(--nx-accent);box-shadow:0 0 0 3px var(--nx-accent-soft)}
.flt-cmd-ic{display:grid;place-items:center;color:var(--nx-fg-faint);flex:none}
.flt-cmd-crumb{display:inline-flex;align-items:center;gap:2px;font-family:var(--nx-font-mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--nx-accent);background:var(--nx-accent-soft);border:0;padding:3px 7px 3px 4px;cursor:pointer;flex:none}
.flt-cmd-input{border:0;outline:none;background:none;font-size:13px;color:var(--nx-fg);min-width:110px;flex:1;height:100%}
.flt-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:60;width:min(348px,86vw);background:var(--nx-bg);
  border:1px solid var(--nx-border-strong);box-shadow:var(--nx-shadow-2);animation:fltPop .16s var(--nx-ease-settle)}
@keyframes fltPop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.flt-pop-list{max-height:300px;overflow:auto;padding:5px}
.flt-sug{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;border-left:2px solid transparent;padding:9px 10px;cursor:pointer;color:var(--nx-fg)}
.flt-sug.is-active{background:var(--nx-bg-sunken);border-left-color:var(--nx-accent)}
.flt-sug-ic{display:grid;place-items:center;color:var(--nx-fg-faint);flex:none}
.flt-sug-main{font-size:13px;line-height:1.3;overflow:hidden;text-overflow:ellipsis}
.flt-sug-f{font-weight:600}
.flt-sug-op{font-family:var(--nx-font-mono);font-size:10.5px;color:var(--nx-fg-muted);text-transform:uppercase;letter-spacing:.05em;margin:0 5px}
.flt-sug-go{margin-left:auto;color:var(--nx-fg-faint);font-size:15px;flex:none}
.flt-hl{background:var(--nx-accent-soft);color:inherit}
.flt-empty{padding:14px 12px;color:var(--nx-fg-muted);font-size:12.5px}
.flt-pop-foot{display:flex;gap:14px;align-items:center;padding:7px 11px;border-top:1px solid var(--nx-border);
  font-family:var(--nx-font-mono);font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--nx-fg-faint)}
.flt-pop-foot kbd{font-family:var(--nx-font-mono);background:var(--nx-bg-sunken);border:1px solid var(--nx-border);padding:1px 5px;margin-right:4px;color:var(--nx-fg-muted)}
.flt-pick-form{padding:11px}
.flt-pick-lbl{display:flex;align-items:center;gap:7px;font-family:var(--nx-font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--nx-accent);margin-bottom:9px}
.flt-pick-row{display:flex;gap:7px;align-items:stretch}
.flt-pick-op{border:1px solid var(--nx-border);background:var(--nx-bg);font-family:var(--nx-font-mono);font-size:11px;text-transform:uppercase;padding:7px 8px;color:var(--nx-fg)}
.flt-pick-val{flex:1;min-width:0;border:1px solid var(--nx-border);padding:7px 9px;font-size:13px;outline:none;color:var(--nx-fg);background:var(--nx-bg)}
.flt-pick-val:focus{border-color:var(--nx-accent)}
.flt-pick-go{display:grid;place-items:center;width:40px;flex:none;border:1px solid var(--nx-accent);background:var(--nx-accent);color:var(--nx-accent-fg);cursor:pointer}
@media(max-width:768px){.flt-bar{flex-basis:100%}.flt-cmd{min-width:0;width:100%;max-width:none}.flt-pop{width:100%}}
`;
