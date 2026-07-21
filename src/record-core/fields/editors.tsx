import * as React from "react";
import { CalendarIcon, ChevronsUpDown } from "lucide-react";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "../../components/ui/command";
import { Checkbox, Input } from "../../primitives/fields";
import type { AddressValue, FullNameValue, MoneyValue } from "../types";
import { isMoneyValue, normalizeOption } from "../types";
import type { FieldDraftProps } from "./types";
import { formatCell } from "../DataTable";
import { OptionChip } from "../options";
import { listValidators, selectOptionsFor } from "./draft";

/* Field editors — the ONE per-type editor set every draft surface renders
   (create dialog, form view; the guided wizard shares the coercion layer, its
   question widgets are deliberately its own). The shaped editors (money, lists,
   address, fullName) are also the record page's inline editors: they moved here
   from RecordPage.tsx, which re-exports them so existing imports keep working.
   Testid convention: every editor renders `field-<fieldKey>` and callers prefix
   fieldKey per surface ("new-…" in the create dialog, "form-…" in the form view). */

const fieldErrStyle: React.CSSProperties = { color: "var(--nx-danger)", font: "var(--nx-text-meta)" };
/* group editors commit when focus leaves the WHOLE group, not between its inputs */
const leftGroup = (e: React.FocusEvent<HTMLElement>) => !e.currentTarget.contains(e.relatedTarget as Node | null);

/* Money — amount + ISO 4217 code inputs, one {amount, code} patch (code stored uppercase). */
export function MoneyField({ fieldKey, label, value, onSave }: { fieldKey: string; label: string; value: unknown; onSave: (v: MoneyValue | null) => void }) {
  const cur = isMoneyValue(value) ? value : null;
  const [amount, setAmount] = React.useState(cur ? String(cur.amount) : "");
  const [code, setCode] = React.useState(cur?.code ?? "");
  const [err, setErr] = React.useState<string | null>(null);
  const commit = () => {
    const a = amount.trim();
    if (!a) {
      if (cur) onSave(null);
      return;
    }
    const n = Number(a);
    const c = code.trim().toUpperCase();
    if (Number.isNaN(n)) return setErr(`${label}: amount must be a number`);
    if (c && !/^[A-Z]{3}$/.test(c)) return setErr(`${label}: code must be a 3-letter currency code`);
    setErr(null);
    if (!cur || cur.amount !== n || (cur.code ?? "") !== c) onSave({ amount: n, code: c });
  };
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid={`field-${fieldKey}`} onBlur={(e) => leftGroup(e) && commit()}>
      <span style={{ display: "flex", gap: 6 }}>
        <input
          className="nxCellEdit"
          type="number"
          style={{ flex: 1 }}
          value={amount}
          placeholder="Amount"
          aria-label={`${label} amount`}
          data-testid={`field-${fieldKey}-amount`}
          onChange={(e) => { setAmount(e.target.value); if (err) setErr(null); }}
        />
        <input
          className="nxCellEdit"
          style={{ width: 52, textTransform: "uppercase" }}
          value={code}
          placeholder="EUR"
          maxLength={3}
          aria-label={`${label} currency code`}
          data-testid={`field-${fieldKey}-code`}
          onChange={(e) => { setCode(e.target.value); if (err) setErr(null); }}
        />
      </span>
      {err && <span data-testid={`field-${fieldKey}-err`} style={fieldErrStyle}>{err}</span>}
    </span>
  );
}

/* List editor (emails/phones/links) — entry rows with remove, add-on-Enter,
   per-entry validation surfacing an inline error that NAMES the field. */
export function ListField({
  fieldKey,
  label,
  value,
  placeholder,
  validate,
  onSave,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  placeholder: string;
  /* error message (naming the field) or null when the entry is valid */
  validate: (entry: string) => string | null;
  onSave: (vals: string[]) => void;
}) {
  const vals = Array.isArray(value) ? (value as unknown[]).map(String) : [];
  const [draft, setDraft] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const e = validate(v);
    if (e) return setErr(e);
    setErr(null);
    if (!vals.includes(v)) onSave([...vals, v]);
    setDraft("");
  };
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid={`field-${fieldKey}`}>
      {vals.map((v, i) => (
        <span key={`${v}-${i}`} data-testid={`field-${fieldKey}-row-${i}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "var(--nx-text-body)" }}>{v}</span>
          <button
            type="button"
            aria-label={`Remove ${v}`}
            data-testid={`field-${fieldKey}-rm-${i}`}
            style={{ border: 0, background: "none", cursor: "pointer", color: "var(--nx-fg-faint)", padding: 0 }}
            onClick={() => onSave(vals.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="nxCellEdit"
        placeholder={placeholder}
        value={draft}
        aria-label={label}
        data-testid={`field-${fieldKey}-input`}
        onChange={(e) => { setDraft(e.target.value); if (err) setErr(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={() => { if (draft.trim()) add(); }}
      />
      {err && <span data-testid={`field-${fieldKey}-err`} style={fieldErrStyle}>{err}</span>}
    </span>
  );
}

const ADDRESS_PARTS = ["street", "city", "postcode", "country"] as const;

/* Address — inline group of 4 labeled inputs saving as ONE patch. */
export function AddressField({ fieldKey, label, value, onSave }: { fieldKey: string; label: string; value: unknown; onSave: (v: AddressValue | null) => void }) {
  const cur: AddressValue = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as AddressValue) : {};
  const [d, setD] = React.useState<Record<string, string>>(
    Object.fromEntries(ADDRESS_PARTS.map((p) => [p, cur[p] ?? ""])),
  );
  const commit = () => {
    const next: AddressValue = {};
    for (const p of ADDRESS_PARTS) if (d[p].trim()) next[p] = d[p].trim();
    const changed = ADDRESS_PARTS.some((p) => (cur[p] ?? "") !== (next[p] ?? ""));
    if (changed) onSave(Object.keys(next).length ? next : null);
  };
  return (
    <span
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
      data-testid={`field-${fieldKey}`}
      aria-label={label}
      onBlur={(e) => leftGroup(e) && commit()}
    >
      {ADDRESS_PARTS.map((p) => (
        <label key={p} style={{ display: "flex", flexDirection: "column", gap: 2, ...(p === "street" ? { gridColumn: "1 / -1" } : {}) }}>
          <span style={{ font: "var(--nx-text-meta)", color: "var(--nx-fg-faint)", textTransform: "capitalize" }}>{p}</span>
          <input
            className="nxCellEdit"
            value={d[p]}
            aria-label={`${label} ${p}`}
            data-testid={`field-${fieldKey}-${p}`}
            onChange={(e) => setD((m) => ({ ...m, [p]: e.target.value }))}
          />
        </label>
      ))}
    </span>
  );
}

/* Full name — first/last inputs saving as ONE patch. */
export function FullNameField({ fieldKey, label, value, onSave }: { fieldKey: string; label: string; value: unknown; onSave: (v: FullNameValue | null) => void }) {
  const cur: FullNameValue = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as FullNameValue) : {};
  const [first, setFirst] = React.useState(cur.first ?? "");
  const [last, setLast] = React.useState(cur.last ?? "");
  const commit = () => {
    const f = first.trim();
    const l = last.trim();
    if ((cur.first ?? "") === f && (cur.last ?? "") === l) return;
    if (!f && !l) return onSave(null);
    const next: FullNameValue = {};
    if (f) next.first = f;
    if (l) next.last = l;
    onSave(next);
  };
  return (
    <span style={{ display: "flex", gap: 6 }} data-testid={`field-${fieldKey}`} onBlur={(e) => leftGroup(e) && commit()}>
      <input
        className="nxCellEdit"
        style={{ flex: 1 }}
        value={first}
        placeholder="First"
        aria-label={`${label} first name`}
        data-testid={`field-${fieldKey}-first`}
        onChange={(e) => setFirst(e.target.value)}
      />
      <input
        className="nxCellEdit"
        style={{ flex: 1 }}
        value={last}
        placeholder="Last"
        aria-label={`${label} last name`}
        data-testid={`field-${fieldKey}-last`}
        onChange={(e) => setLast(e.target.value)}
      />
    </span>
  );
}

/* Multiselect editor — chips + a checkbox popover writing string[]. */
export function MultiSelectField({
  fieldKey,
  label,
  value,
  options,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  options: import("../types").SelectOption[];
  onChange: (vals: string[]) => void;
}) {
  const vals = Array.isArray(value) ? value.map(String) : [];
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="nxCellEdit"
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", flexWrap: "wrap", textAlign: "left" }}
          aria-label={label}
          data-testid={`field-${fieldKey}`}
        >
          {vals.length === 0 && <span style={{ color: "var(--nx-fg-faint)" }}>Pick…</span>}
          {vals.map((t) => (
            <span key={t} data-testid={`field-${fieldKey}-chip-${t.replaceAll(/\W+/g, "-").toLowerCase()}`}>
              <OptionChip field={{ key: fieldKey, label, type: "multiselect", options } as never} value={t} />
            </span>
          ))}
          <ChevronsUpDown size={12} style={{ color: "var(--nx-fg-faint)", marginLeft: "auto", flex: "none" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: 240, padding: 0 }}>
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((raw) => {
                const o = normalizeOption(raw);
                const on = vals.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    data-testid={`field-${fieldKey}-opt-${o.value.replaceAll(/\W+/g, "-").toLowerCase()}`}
                    onSelect={() => onChange(on ? vals.filter((x) => x !== o.value) : [...vals, o.value])}
                  >
                    <span style={{ width: 14, textAlign: "center" }}>{on ? "✓" : ""}</span>
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* Array editor — free-form tags: type + Enter adds, × removes (no fixed vocabulary). */
export function ArrayField({ fieldKey, label, value, onChange }: { fieldKey: string; label: string; value: unknown; onChange: (vals: string[]) => void }) {
  const vals = Array.isArray(value) ? value.map(String) : [];
  const [draft, setDraft] = React.useState("");
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }} data-testid={`field-${fieldKey}`}>
      {vals.map((v) => (
        <span key={v} className="nxOptChip" style={{ background: "var(--nx-bg-sunken)", border: "1px solid var(--nx-border)", color: "var(--nx-fg-muted)" }}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} data-testid={`field-${fieldKey}-rm-${v.replaceAll(/\W+/g, "-").toLowerCase()}`}
            style={{ border: 0, background: "none", cursor: "pointer", color: "inherit", padding: 0 }}
            onClick={() => onChange(vals.filter((x) => x !== v))}>×</button>
        </span>
      ))}
      <input
        className="nxCellEdit"
        style={{ minWidth: 80, flex: 1 }}
        placeholder="Add…"
        value={draft}
        aria-label={label}
        data-testid={`field-${fieldKey}-input`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (draft.trim() && !vals.includes(draft.trim())) onChange([...vals, draft.trim()]);
            if (draft.trim()) setDraft("");
          }
        }}
      />
    </span>
  );
}

/* Date field editor — calendar popover writing yyyy-mm-dd (the wire format). */
export function DateField({
  fieldKey,
  label,
  value,
  onPick,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  onPick: (iso: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? new Date(String(value)) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="nxCellEdit"
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textAlign: "left" }}
          aria-label={label}
          data-testid={`field-${fieldKey}`}
        >
          <CalendarIcon size={13} style={{ color: "var(--nx-fg-faint)", flex: "none" }} />
          <span data-testid={`field-${fieldKey}-value`}>{value ? formatCell(value, "date") : "Pick a date"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: "auto", padding: 0 }}>
        <Calendar
          mode="single"
          selected={selected && !Number.isNaN(selected.getTime()) ? selected : undefined}
          defaultMonth={selected && !Number.isNaN(selected.getTime()) ? selected : undefined}
          onSelect={(d) => {
            if (d) {
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              onPick(iso);
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ---- draft-mode editors: value + onChange controlled, one per field type.
   Registered on the field-type registry via fields/<type>/definition.ts —
   fieldDraftEditor (./draft-resolve) is the host-side lookup. Props are the
   registry's FieldDraftProps; `fieldKey` defaults to the field's own key. ---- */

export function DraftText({ field, fieldKey, value, onChange, error, autoFocus }: FieldDraftProps) {
  return (
    <Input
      value={String(value ?? "")}
      aria-label={field.label}
      aria-invalid={error ? true : undefined}
      autoFocus={autoFocus}
      data-testid={`field-${fieldKey ?? field.key}`}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DraftLongText({ field, fieldKey, value, onChange, error }: FieldDraftProps) {
  return (
    <textarea
      className="nxInput"
      rows={field.type === "richText" ? 4 : 3}
      value={String(value ?? "")}
      aria-label={field.label}
      aria-invalid={error ? true : undefined}
      data-testid={`field-${fieldKey ?? field.key}`}
      style={{ resize: "vertical", font: "var(--nx-text-body)" }}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DraftNumber({ field, fieldKey, value, onChange, error, autoFocus }: FieldDraftProps) {
  return (
    <Input
      type="number"
      value={String(value ?? "")}
      aria-label={field.label}
      aria-invalid={error ? true : undefined}
      autoFocus={autoFocus}
      data-testid={`field-${fieldKey ?? field.key}`}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DraftSelect({ field, fieldKey, value, onChange, error }: FieldDraftProps) {
  return (
    <select
      className="nxInput"
      value={String(value ?? "")}
      aria-label={field.label}
      aria-invalid={error ? true : undefined}
      data-testid={`field-${fieldKey ?? field.key}`}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {selectOptionsFor(field).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function DraftUser({ field, fieldKey, value, onChange, users = [], error }: FieldDraftProps) {
  return (
    <select
      className="nxInput"
      value={String(value ?? "")}
      aria-label={field.label}
      aria-invalid={error ? true : undefined}
      data-testid={`field-${fieldKey ?? field.key}`}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {users.map((u) => (
        <option key={u} value={u}>{u}</option>
      ))}
    </select>
  );
}

export function DraftBoolean({ field, fieldKey, value, onChange }: FieldDraftProps) {
  return (
    <label style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
      <Checkbox
        aria-label={field.label}
        checked={value === true}
        data-testid={`field-${fieldKey ?? field.key}`}
        onCheckedChange={(v) => onChange(v)}
      />
      <span style={{ font: "var(--nx-text-meta)", color: "var(--nx-fg-muted)" }}>{value === true ? "Yes" : "No"}</span>
    </label>
  );
}

export function DraftRating({ field, fieldKey, value, onChange }: FieldDraftProps) {
  const scale = field.scale ?? 5;
  const val = typeof value === "number" ? value : 0;
  const key = fieldKey ?? field.key;
  return (
    <span data-testid={`field-${key}`} style={{ letterSpacing: 2, cursor: "pointer", color: "var(--nx-warn)", fontSize: 15 }}>
      {Array.from({ length: scale }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${field.label}: ${i + 1} of ${scale}`}
          data-testid={`field-${key}-star-${i + 1}`}
          style={{ border: 0, background: "none", cursor: "pointer", color: "inherit", padding: 0, font: "inherit" }}
          onClick={() => onChange(i + 1 === val ? 0 : i + 1)}
        >
          {i < val ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}

export function DraftDate({ field, fieldKey, value, onChange }: FieldDraftProps) {
  return <DateField fieldKey={fieldKey ?? field.key} label={field.label} value={value} onPick={onChange} />;
}

export function DraftDateTime({ field, fieldKey, value, onChange, error }: FieldDraftProps) {
  return (
    <input
      className="nxInput"
      type="datetime-local"
      value={value ? String(value).slice(0, 16) : ""}
      aria-label={field.label}
      aria-invalid={error ? true : undefined}
      data-testid={`field-${fieldKey ?? field.key}`}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
    />
  );
}

export function DraftMultiSelect({ field, fieldKey, value, onChange }: FieldDraftProps) {
  return <MultiSelectField fieldKey={fieldKey ?? field.key} label={field.label} value={value} options={field.options ?? []} onChange={onChange} />;
}

export function DraftArray({ field, fieldKey, value, onChange }: FieldDraftProps) {
  return <ArrayField fieldKey={fieldKey ?? field.key} label={field.label} value={value} onChange={onChange} />;
}

export function DraftMoney({ field, fieldKey, value, onChange }: FieldDraftProps) {
  return <MoneyField fieldKey={fieldKey ?? field.key} label={field.label} value={value} onSave={onChange} />;
}

export function DraftList({ field, fieldKey, value, onChange }: FieldDraftProps) {
  const placeholder = field.type === "emails" ? "Add an email…" : field.type === "phones" ? "Add a phone…" : "Add a URL…";
  return (
    <ListField
      fieldKey={fieldKey ?? field.key}
      label={field.label}
      value={value}
      placeholder={placeholder}
      validate={listValidators[field.type](field.label)}
      onSave={onChange}
    />
  );
}

export function DraftAddress({ field, fieldKey, value, onChange }: FieldDraftProps) {
  return <AddressField fieldKey={fieldKey ?? field.key} label={field.label} value={value} onSave={onChange} />;
}

export function DraftFullName({ field, fieldKey, value, onChange }: FieldDraftProps) {
  return <FullNameField fieldKey={fieldKey ?? field.key} label={field.label} value={value} onSave={onChange} />;
}

/* single relations author by the target's PRIMARY LABEL: the server resolves a
   label matching exactly one live target to its id (ambiguity 400s naming the
   candidates, surfaced inline) — no option fetching in the library layer */
export function DraftRelation({ field, fieldKey, value, onChange, error }: FieldDraftProps) {
  const target = field.relationTargets?.join(" / ") ?? field.relation ?? "record";
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Input
        value={String(value ?? "")}
        aria-label={field.label}
        aria-invalid={error ? true : undefined}
        placeholder={`Exact ${target} name…`}
        data-testid={`field-${fieldKey ?? field.key}`}
        onChange={(e) => onChange(e.target.value)}
      />
      <span style={{ font: "var(--nx-text-meta)", color: "var(--nx-fg-faint)" }}>Matches an existing {target} by name</span>
    </span>
  );
}
