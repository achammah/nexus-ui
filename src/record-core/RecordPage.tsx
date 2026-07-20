import * as React from "react";
import {
  ArrowLeft, CalendarIcon, CalendarClock, ChevronsUpDown, ExternalLink, Eye, EyeOff, Star,
  Flag, Mail, MessageSquare, Paperclip, Pencil, Phone, Plus, Sparkles, Upload,
} from "lucide-react";
import { Button } from "../primitives/Button";
import { ThinkingDots } from "../primitives/ThinkingDots";
import { Badge, Micro, Tabs, TabPanel } from "../primitives/fields";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import { formatCell } from "./DataTable";
import type { AddressValue, FieldDef, FileMeta, FullNameValue, MoneyValue, ObjectConfig, RecordRow, RelationItem, TimelineEvent } from "./types";
import { isMoneyValue, normalizeOption, optionValues, rowRefs } from "./types";
import { NotionEditor, textToBlocks, type Block } from "./NotionEditor";
import { useSuggestions, type Suggestion } from "./useSuggestions";
import { SuggestionPanel } from "./SuggestionPanel";
import { Pipeline } from "./Pipeline";
import { OptionChip, activeFields } from "./options";
import "./record-core.css";

/* Timeline icon per event kind (activity subkind wins). */
function evIcon(ev: TimelineEvent): { node: React.ReactNode; tid: string } {
  if (ev.kind === "activity") {
    const map: Record<string, React.ReactNode> = {
      call: <Phone size={11} />, email: <Mail size={11} />, meeting: <CalendarClock size={11} />,
    };
    const k = ev.activity ?? "call";
    return { node: map[k] ?? <MessageSquare size={11} />, tid: `tl-ic-${k}` };
  }
  const map: Record<string, [React.ReactNode, string]> = {
    note: [<MessageSquare size={11} />, "tl-ic-note"],
    file: [<Paperclip size={11} />, "tl-ic-file"],
    stage: [<Flag size={11} />, "tl-ic-stage"],
    created: [<Plus size={11} />, "tl-ic-created"],
  };
  const hit = map[ev.kind] ?? [<Pencil size={11} />, "tl-ic-updated"];
  return { node: hit[0], tid: hit[1] };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ACTIVITY_KINDS = [
  { key: "call", label: "Call", icon: <Phone size={12} /> },
  { key: "email", label: "Email", icon: <Mail size={12} /> },
  { key: "meeting", label: "Meeting", icon: <CalendarClock size={12} /> },
] as const;

/* Downscale oversized images client-side before upload (canvas, longest edge
   capped) — cuts payloads for free; non-images and small images pass through. */
const MAX_IMAGE_EDGE = 1600;
function prepareUpload(file: File): Promise<{ name: string; mime: string; data: string }> {
  const toB64 = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? "").split(",")[1] ?? "");
      r.readAsDataURL(blob);
    });
  if (!file.type.startsWith("image/")) {
    return toB64(file).then((data) => ({ name: file.name, mime: file.type || "application/octet-stream", data }));
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const passthrough = () =>
      toB64(file).then((data) => resolve({ name: file.name, mime: file.type, data }));
    img.onload = () => {
      URL.revokeObjectURL(url);
      const edge = Math.max(img.width, img.height);
      if (edge <= MAX_IMAGE_EDGE) return passthrough();
      const scale = MAX_IMAGE_EDGE / edge;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? toB64(blob).then((data) => resolve({ name: file.name, mime: file.type, data })) : passthrough()),
        file.type === "image/png" ? "image/png" : "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); passthrough(); };
    img.src = url;
  });
}

/* A related list rendered under Details — the reverse side of a relation
   (consumer computes rows; see the starter's RecordView). */
export interface RelatedList {
  key: string;
  label: string;
  rows: RecordRow[];
  primaryKey: string;
  metaKey?: string;
  onOpen: (id: string) => void;
}

/* Multiselect editor — chips + a checkbox popover writing string[]. */
function MultiSelectField({
  fieldKey,
  label,
  value,
  options,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  options: import("./types").SelectOption[];
  onChange: (vals: string[]) => void;
}) {
  const vals = Array.isArray(value) ? value.map(String) : [];
  const meta = new Map(options.map((o) => { const n = normalizeOption(o); return [n.value, n] as const; }));
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
function ArrayField({ fieldKey, label, value, onChange }: { fieldKey: string; label: string; value: unknown; onChange: (vals: string[]) => void }) {
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
          if (e.key === "Enter" && draft.trim()) {
            if (!vals.includes(draft.trim())) onChange([...vals, draft.trim()]);
            setDraft("");
          }
        }}
      />
    </span>
  );
}

/* ---- shaped (composite) field editors — each saves ONE patch of the whole value ---- */

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
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
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

/* per-entry validators for the list types — messages NAME the field */
export const listValidators: Record<string, (label: string) => (entry: string) => string | null> = {
  emails: (label) => (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : `${label}: "${v}" is not a valid email address`),
  phones: (label) => (v) => (/^[0-9+()\-\s.]{3,}$/.test(v) ? null : `${label}: "${v}" is not a valid phone number`),
  links: (label) => (v) =>
    [v, `https://${v}`].some((u) => { try { new URL(u); return u.includes("."); } catch { return false; } })
      ? null
      : `${label}: "${v}" is not a valid URL or domain`,
};

/* type tag rendered after a picker row's label when results span object types */
function TypeTag({ item }: { item: RelationItem }) {
  return (
    <span
      className="nxCount"
      style={{ marginLeft: "auto", flex: "none", textTransform: "capitalize" }}
      data-testid={`rel-type-${item.type}`}
    >
      {item.typeLabel ?? item.type}
    </span>
  );
}

/* option testids keep their historical LABEL-slug shape (journeys select on
   them); identity mode adds data-rel-id so same-labeled rows stay selectable */
const relOptTestid = (fieldKey: string, o: { label: string }) =>
  `field-${fieldKey}-opt-${o.label.replaceAll(/\W+/g, "-").toLowerCase()}`;

/* Relation picker — combobox over the target object's records. Two modes:
   ITEMS (identity-aware: rows are {id,label,type?}, the pick hands back the
   item so relations save by ID; option testids use the id) and legacy OPTIONS
   (plain label strings). Poly items spanning >1 type grow a type tag per row. */
function RelationPicker({
  fieldKey,
  label,
  value,
  options,
  items,
  onPick,
  onPickItem,
  onJump,
  onCreate,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  options?: string[];
  /* identity mode — supersedes `options` when present */
  items?: RelationItem[];
  onPick?: (v: string) => void;
  onPickItem?: (item: RelationItem) => void;
  onJump?: () => void;
  /* "the thing I want doesn't exist yet": create-with-title + attach in one step */
  onCreate?: (title: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const rows: RelationItem[] = items ?? (options ?? []).map((o) => ({ id: o, label: o }));
  const identityMode = !!items;
  const mixedTypes = identityMode && new Set(rows.map((r) => r.type).filter(Boolean)).size > 1;
  const pick = (row: RelationItem) => {
    if (identityMode) onPickItem?.(row);
    else onPick?.(row.label);
    setOpen(false);
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="nxCellEdit"
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textAlign: "left", flex: 1 }}
            aria-label={label}
            data-testid={`field-${fieldKey}`}
          >
            <span data-testid={`field-${fieldKey}-value`} style={{ flex: 1 }}>
              {String(value ?? "") || "Pick…"}
            </span>
            <ChevronsUpDown size={12} style={{ color: "var(--nx-fg-faint)", flex: "none" }} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" style={{ width: 260, padding: 0 }}>
          <Command>
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}…`}
              data-testid={`field-${fieldKey}-search`}
              value={q}
              onValueChange={setQ}
              onKeyDown={(e) => {
                // keyboard path for "no match → create": Enter with zero hits
                if (e.key !== "Enter" || !onCreate) return;
                const needle = q.trim().toLowerCase();
                if (!needle || rows.some((o) => o.label.toLowerCase().includes(needle))) return;
                e.preventDefault();
                onCreate(q.trim());
                setQ("");
                setOpen(false);
              }}
            />
            <CommandList>
              <CommandEmpty>
                {onCreate && q.trim() ? (
                  <button
                    type="button"
                    className="nxBtn nxBtn--secondary nxBtn--sm"
                    style={{ width: "100%", justifyContent: "flex-start", gap: 6 }}
                    data-testid={`field-${fieldKey}-create`}
                    onClick={() => {
                      onCreate(q.trim());
                      setQ("");
                      setOpen(false);
                    }}
                  >
                    <Plus size={13} /> Create “{q.trim()}”
                  </button>
                ) : (
                  "No match."
                )}
              </CommandEmpty>
              <CommandGroup>
                {rows.map((o, i) => (
                  <CommandItem
                    key={identityMode ? `${o.type ?? ""}:${o.id}` : `${o.label}-${i}`}
                    value={`${o.label} ${identityMode ? o.id : ""}`.trim()}
                    data-testid={relOptTestid(fieldKey, o)}
                    {...(identityMode ? { "data-rel-id": o.id } : {})}
                    onSelect={() => pick(o)}
                  >
                    {o.label}
                    {mixedTypes && o.type && <TypeTag item={o} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onJump && String(value ?? "") && (
        <Button variant="ghost" size="sm" icon={<ExternalLink size={12} />} aria-label={`Open ${label}`} data-testid={`field-${fieldKey}-jump`} onClick={onJump} />
      )}
    </span>
  );
}

/* Many-relation editor — attached chips (grouped by type for poly fields) with
   per-chip detach, plus a checkbox picker holding a LOCAL pending set: toggles
   never fire network calls; the accumulated diff commits as ONE operation when
   the dropdown closes (Escape / click-outside). */
function MultiRelationField({
  fieldKey,
  label,
  attached,
  items,
  grouped,
  onCommit,
  onCreate,
}: {
  fieldKey: string;
  label: string;
  /* currently linked records, in stored order (ids + projected labels) */
  attached: RelationItem[];
  items: RelationItem[];
  /* poly: cluster the attached chips by target type */
  grouped?: boolean;
  onCommit: (ids: RelationItem[]) => void;
  onCreate?: (title: string) => void;
}) {
  const [open, setOpenRaw] = React.useState(false);
  const [pending, setPending] = React.useState<Map<string, RelationItem>>(new Map());
  const keyOf = (r: RelationItem) => `${r.type ?? ""}:${r.id}`;
  const mixedTypes = new Set(items.map((r) => r.type).filter(Boolean)).size > 1;
  const setOpen = (next: boolean) => {
    if (next) {
      setPending(new Map(attached.map((a) => [keyOf(a), a])));
    } else {
      const before = attached.map(keyOf).join("|");
      const after = [...pending.keys()].join("|");
      if (before !== after) onCommit([...pending.values()]);
    }
    setOpenRaw(next);
  };
  const groups: [string, RelationItem[]][] = grouped
    ? [...new Set(attached.map((a) => a.type ?? ""))].map((t) => [t, attached.filter((a) => (a.type ?? "") === t)])
    : [["", attached]];
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid={`field-${fieldKey}`}>
      {attached.length > 0 &&
        groups.map(([t, list]) => (
          <span key={t || "all"} data-testid={t ? `field-${fieldKey}-group-${t}` : undefined} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            {grouped && t && (
              <Micro>{list[0]?.typeLabel ?? t}</Micro>
            )}
            {list.map((a) => (
              <span key={keyOf(a)} className="nxOptChip" data-testid={`field-${fieldKey}-chip-${a.id}`}
                style={{ background: "var(--nx-bg-sunken)", border: "1px solid var(--nx-border)", color: "var(--nx-fg-muted)" }}>
                {a.label}
                <button
                  type="button"
                  aria-label={`Detach ${a.label}`}
                  data-testid={`field-${fieldKey}-rm-${a.id}`}
                  style={{ border: 0, background: "none", cursor: "pointer", color: "inherit", padding: 0 }}
                  onClick={() => onCommit(attached.filter((x) => keyOf(x) !== keyOf(a)))}
                >
                  ×
                </button>
              </span>
            ))}
          </span>
        ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="nxCellEdit"
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textAlign: "left" }}
            aria-label={label}
            data-testid={`field-${fieldKey}-open`}
          >
            <span style={{ color: "var(--nx-fg-faint)" }}>{attached.length ? "Edit links…" : "Pick…"}</span>
            <ChevronsUpDown size={12} style={{ color: "var(--nx-fg-faint)", marginLeft: "auto", flex: "none" }} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" style={{ width: 260, padding: 0 }}>
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} data-testid={`field-${fieldKey}-search`} />
            <CommandList>
              <CommandEmpty>
                {onCreate ? "No match — type in the field's picker to create." : "No match."}
              </CommandEmpty>
              <CommandGroup>
                {items.map((o) => {
                  const on = pending.has(keyOf(o));
                  return (
                    <CommandItem
                      key={keyOf(o)}
                      value={`${o.label} ${o.id}`}
                      data-testid={`field-${fieldKey}-opt-${o.id}`}
                      onSelect={() => {
                        // local toggle only — the diff commits once, on close
                        setPending((m) => {
                          const next = new Map(m);
                          if (next.has(keyOf(o))) next.delete(keyOf(o));
                          else next.set(keyOf(o), o);
                          return next;
                        });
                      }}
                    >
                      <span style={{ width: 14, textAlign: "center" }}>{on ? "✓" : ""}</span>
                      {o.label}
                      {mixedTypes && o.type && <TypeTag item={o} />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </span>
  );
}

/* Date field editor — calendar popover writing yyyy-mm-dd (the wire format). */
function DateField({
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

/* richText editor field — a controlled NotionEditor over a Block[] value.
   The editor fires onChange per keystroke, so this wrapper holds the live document
   in local state and DEBOUNCES a single whole-Block[] commit through onSave (→ onPatch)
   — one save per pause, never a patch/reload/toast per keystroke. Seed-once: local
   state owns the live document, so a concurrent record-poll re-rendering the page can't
   clobber in-progress edits (the mount site keys this by row id, so switching records
   reseeds while a same-record poll does not). A subtle save-state chip mirrors the
   async status. Swap the local debounce for foundations' useDebouncedSave({saveState})
   when that lane lands — one debounce implementation, not two. */
/* optional inline-suggestions surface — mounted only when the field config carries a
   `suggestTaskId` AND the host supplied the `suggest` bundle. See RichTextField. */
interface SuggestProps {
  suggestionsValue: unknown;                          // row[`${field}__suggestions`]
  requesting: boolean;                                // an AI request is in flight
  readOnly?: boolean;
  onRequest: () => void;                              // fire the AI task (host reloads → new changes flow in)
  onPersist: (changes: Suggestion[]) => void;         // persist resolved statuses
  pipelineStates?: string[];                          // config-declared states (Pipeline)
  pipelineCurrent?: string;
}

function RichTextField({ fieldKey, label, value, onSave, suggest }: {
  fieldKey: string; label: string; value: unknown; onSave: (blocks: Block[]) => void;
  suggest?: SuggestProps;
}) {
  const [blocks, setBlocks] = React.useState<Block[]>(() => {
    const b = Array.isArray(value) ? (value as Block[]) : [];
    return b.length ? b : textToBlocks(""); // always at least one line to type in
  });
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onChange = React.useCallback((next: Block[]) => {
    setBlocks(next);
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { onSave(next); setSaveState("saved"); }, 700);
  }, [onSave]);

  const saveChip = saveState !== "idle" && (
    <span
      data-testid={`richtext-save-${fieldKey}`}
      data-state={saveState}
      style={{ font: "var(--nx-text-meta)", color: "var(--nx-fg-faint)", alignSelf: "flex-end" }}
    >
      {saveState === "saving" ? "Saving…" : "Saved"}
    </span>
  );

  // no suggestions configured → the plain editor, byte-for-byte unchanged
  if (!suggest) {
    return (
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid={`field-${fieldKey}`} aria-label={label}>
        <NotionEditor blocks={blocks} onChange={onChange} />
        {saveChip}
      </span>
    );
  }
  return (
    <SuggestionsSurface
      fieldKey={fieldKey}
      label={label}
      blocks={blocks}
      onBlocksChange={onChange}
      saveChip={saveChip}
      {...suggest}
    />
  );
}

/* editor + inline tracked changes + right-rail review panel + optional Pipeline. The
   changes come from the server (row[`${field}__suggestions`]); the accept/reject engine
   (useSuggestions) folds an accepted change into the document (through the editor's
   debounced save) and persists resolved statuses through onPersist. Entity-agnostic —
   every object-specific value (task id, states) arrives as a prop. */
function SuggestionsSurface({
  fieldKey, label, blocks, onBlocksChange, saveChip,
  suggestionsValue, requesting, readOnly, onRequest, onPersist, pipelineStates, pipelineCurrent,
}: SuggestProps & {
  fieldKey: string; label: string; blocks: Block[];
  onBlocksChange: (next: Block[]) => void; saveChip: React.ReactNode;
}) {
  const sigIds = (arr: Suggestion[] | undefined) => (arr ?? []).map((c) => c.id).join(",");
  const [changes, setChanges] = React.useState<Suggestion[]>(() =>
    Array.isArray(suggestionsValue) ? (suggestionsValue as Suggestion[]) : []);
  // adopt a fresh server set when the id-set changes (a new request, or cleared);
  // in-place status flips stay local-authoritative until persistence catches up
  React.useEffect(() => {
    const incoming = Array.isArray(suggestionsValue) ? (suggestionsValue as Suggestion[]) : [];
    setChanges((prev) => (sigIds(incoming) !== sigIds(prev) ? incoming : prev));
  }, [suggestionsValue]);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const onChangesChange = React.useCallback((next: Suggestion[]) => {
    setChanges(next);
    onPersist(next);
  }, [onPersist]);
  const eng = useSuggestions(blocks, onBlocksChange, changes, onChangesChange);

  // clicking a card scrolls to + highlights its inline widget in the editor
  const focus = (id: string) => {
    setHovered(id);
    const el = rootRef.current?.querySelector(`.ne-chg[data-cid="${id}"]`) as HTMLElement | null;
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("is-pulse"); void el.offsetWidth; el.classList.add("is-pulse"); }
  };

  const hasPanel = changes.length > 0 && !readOnly;
  const pipeline = pipelineStates && pipelineStates.length && pipelineCurrent;

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid={`field-${fieldKey}`} aria-label={label}>
      <div className="nxSugSurface-bar">
        {pipeline ? <Pipeline states={pipelineStates!} current={pipelineCurrent!} inProgress={requesting ? pipelineCurrent : null} /> : <span />}
        {!readOnly && (
          <button
            type="button"
            className="nxSugSurface-req"
            data-testid="suggest-request"
            disabled={requesting}
            onClick={onRequest}
            title="Run the AI suggestion task against the current draft"
          >
            <Sparkles size={13} /> {requesting ? "Suggesting…" : changes.length ? "Re-run suggestions" : "Request suggestions"}
          </button>
        )}
      </div>
      <div className={`nxSugSurface${hasPanel ? " has-panel" : ""}`} ref={rootRef}>
        <div className="nxSugSurface-doc">
          <NotionEditor
            blocks={blocks}
            onChange={onBlocksChange}
            readOnly={readOnly}
            changes={changes}
            hoveredChange={hovered}
            onHoverChange={setHovered}
          />
          {saveChip}
        </div>
        {hasPanel && (
          <SuggestionPanel
            changes={changes}
            hovered={hovered}
            onHover={setHovered}
            onFocus={focus}
            onAccept={eng.accept}
            onReject={eng.reject}
            onUndo={eng.undo}
            onAcceptAll={eng.acceptAll}
            onRejectAll={eng.rejectAll}
          />
        )}
      </div>
      <style>{SUG_SURFACE_CSS}</style>
    </span>
  );
}

const SUG_SURFACE_CSS = `
.nxSugSurface-bar{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap}
.nxSugSurface-req{display:inline-flex;align-items:center;gap:7px;background:var(--nx-bg-raised);color:var(--nx-accent);
  border:1px solid var(--nx-accent);padding:7px 13px;font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);
  text-transform:uppercase;cursor:pointer;border-radius:var(--nx-radius-s);transition:background var(--nx-t-fast),transform var(--nx-t-fast)}
.nxSugSurface-req:hover:not(:disabled){background:var(--nx-accent-soft);transform:translateY(-1px)}
.nxSugSurface-req:disabled{opacity:.55;cursor:default}
.nxSugSurface{display:block}
.nxSugSurface.has-panel{display:grid;grid-template-columns:minmax(0,1fr) min(340px,34vw);align-items:start;gap:0}
.nxSugSurface-doc{min-width:0;display:flex;flex-direction:column;gap:4px}
@media(max-width:820px){.nxSugSurface.has-panel{grid-template-columns:1fr}}
`;

/* RecordPage — header (name + stage) · left fields panel (inline edit) ·
   right tabs (Timeline / Notes). The anatomy is the record-system convention:
   glance (header) → zoom (fields/timeline) → act (inline edits, note composer). */

export function RecordPage({
  config,
  row,
  timeline,
  onPatch,
  onBack,
  onAddNote,
  relationOptions = {},
  relationItems,
  onOpenRelation,
  onCreateRelation,
  related = [],
  userOptions = [],
  files,
  onLogActivity,
  onEnrich,
  enrichingKey,
  readOnly,
  watch,
  pin,
  mentionOptions = [],
  suggest,
}: {
  config: ObjectConfig;
  row: RecordRow;
  timeline: TimelineEvent[];
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onBack: () => void;
  onAddNote: (text: string) => void;
  /* relation fieldKey → the target object's primary values (consumer-fetched) */
  relationOptions?: Record<string, string[]>;
  /* identity-aware picker options ({id,label,type?}) — supersedes relationOptions
     for the fields present; REQUIRED for multiple/polymorphic relation fields */
  relationItems?: Record<string, RelationItem[]>;
  onOpenRelation?: (targetObject: string, value: string) => void;
  /* picker "Create …" row: create the target with just a title, attach it, and
     (host's choice) open it for progressive completion */
  onCreateRelation?: (fieldKey: string, title: string) => void;
  related?: RelatedList[];
  /* the app's people directory — `user` fields pick from it */
  userOptions?: string[];
  /* attachments — pass to enable the Files tab (upload + list + download) */
  files?: {
    list: FileMeta[];
    onUpload: (f: { name: string; mime: string; data: string }) => void;
    downloadHref: (fileId: string) => string;
  };
  /* activity composer (call/email/meeting) in the Timeline tab — pass to enable */
  onLogActivity?: (kind: "call" | "email" | "meeting", text: string) => void;
  /* AI-enrichment: fields carrying `primitive` show a Run affordance → this fires */
  onEnrich?: (fieldKey: string) => void;
  /* while enrichment runs for a field, its key is here → the Run affordance becomes a
     ThinkingDots indicator (the host owns the busy state; clears on settle) */
  enrichingKey?: string | null;
  /* permission-driven: fields render as text; composers/upload/enrich hidden */
  readOnly?: boolean;
  /* record subscription (needs an identity): current state + toggle */
  watch?: { on: boolean; count: number; onToggle: (next: boolean) => void };
  /* personal pin (favorites shelf) — presentation only; the host owns storage */
  pin?: { on: boolean; onToggle: (next: boolean) => void };
  /* names offered by the @-autocomplete in the note composer */
  mentionOptions?: string[];
  /* AI inline-suggestions (tracked changes) for richText fields carrying a
     `suggestTaskId`. Supplied → those fields mount the review surface (editor +
     rail panel + Request button); absent → richText renders as a plain editor. */
  suggest?: {
    requestingField?: string | null;   // the field whose AI request is in flight
    onRequest: (fieldKey: string) => void;
    onPersist: (fieldKey: string, changes: Suggestion[]) => void;
  };
}) {
  const primary = config.fields.find((f) => f.primary) ?? config.fields[0];
  const stageField = config.fields.find((f) => f.key === config.stageField);
  // zip a many-relation field's raw refs (row._refs) with its projected labels
  const attachedItems = (f: FieldDef): RelationItem[] => {
    const refs = rowRefs(row)[f.key];
    const labels = Array.isArray(row[f.key]) ? (row[f.key] as unknown[]).map(String) : [];
    if (!Array.isArray(refs)) return [];
    const pool = relationItems?.[f.key] ?? [];
    return (refs as unknown[]).map((r, i) => {
      const isObj = typeof r === "object" && r !== null;
      const id = isObj ? (r as { id: string }).id : String(r);
      const type = isObj ? (r as { object: string }).object : f.relation;
      return { id, label: labels[i] ?? id, type, typeLabel: pool.find((p) => p.type === type)?.typeLabel };
    });
  };
  const [tab, setTab] = React.useState("timeline");
  const [note, setNote] = React.useState("");
  const [actKind, setActKind] = React.useState<"call" | "email" | "meeting">("call");
  const [actText, setActText] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);

  return (
    <div data-testid={`record-${row.id}`}>
      <div className="nxRecordHead">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack} aria-label="Back" />
        <h1 className="nxRecordName" data-testid="record-name">{formatCell(row[primary.key], primary.type) || "—"}</h1>
        {stageField && (
          <span data-testid="record-stage">
            <OptionChip field={stageField} value={row[stageField.key]} />
          </span>
        )}
        <Micro>{config.labelOne}</Micro>
        {pin && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Star size={13} fill={pin.on ? "currentColor" : "none"} />}
            data-testid="fav-toggle"
            aria-label={pin.on ? "Remove from favorites" : "Add to favorites"}
            onClick={() => pin.onToggle(!pin.on)}
          >
            {pin.on ? "Favorited" : "Favorite"}
          </Button>
        )}
        {watch && (
          <Button
            variant="ghost"
            size="sm"
            icon={watch.on ? <Eye size={13} /> : <EyeOff size={13} />}
            data-testid="watch-toggle"
            aria-label={watch.on ? "Stop watching" : "Watch this record"}
            onClick={() => watch.onToggle(!watch.on)}
          >
            {watch.on ? `Watching${watch.count > 1 ? ` · ${watch.count}` : ""}` : "Watch"}
          </Button>
        )}
      </div>

      <div className="nxRecord">
        <div className="nxRecordSide">
          <div className="nxCard">
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--nx-border)" }}>
              <Micro>Details</Micro>
            </div>
            <div className="nxFieldList">
              {activeFields(config.fields).map((f) => (
                <div className="nxFieldRow" key={f.key}>
                  <span className="nxFieldLabel">{f.label}</span>
                  <span className="nxFieldValue">
                    {readOnly ? (
                      <span data-testid={`field-${f.key}`}>{formatCell(row[f.key], f.type) || "—"}</span>
                    ) : f.type === "user" ? (
                      <RelationPicker
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        options={userOptions}
                        onPick={(v) => onPatch(row.id, { [f.key]: v })}
                      />
                    ) : f.type === "multiselect" ? (
                      <MultiSelectField
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        options={f.options ?? []}
                        onChange={(vals) => onPatch(row.id, { [f.key]: vals })}
                      />
                    ) : f.type === "relation" && f.multiple ? (
                      <MultiRelationField
                        fieldKey={f.key}
                        label={f.label}
                        attached={attachedItems(f)}
                        items={relationItems?.[f.key] ?? []}
                        grouped={!!f.relationTargets}
                        onCommit={(list) =>
                          onPatch(row.id, { [f.key]: list.map((x) => (f.relationTargets ? { object: x.type!, id: x.id } : x.id)) })
                        }
                      />
                    ) : f.type === "relation" && relationItems?.[f.key] ? (
                      <RelationPicker
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        items={relationItems[f.key]}
                        onPickItem={(item) =>
                          onPatch(row.id, { [f.key]: f.relationTargets ? { object: item.type!, id: item.id } : item.id })
                        }
                        onJump={(() => {
                          const ref = rowRefs(row)[f.key];
                          const target = f.relation ?? (typeof ref === "object" && !Array.isArray(ref) ? ref.object : undefined);
                          return onOpenRelation && target && String(row[f.key] ?? "")
                            ? () => onOpenRelation(target, String(row[f.key] ?? ""))
                            : undefined;
                        })()}
                        onCreate={onCreateRelation && !f.relationTargets ? (title) => onCreateRelation(f.key, title) : undefined}
                      />
                    ) : f.type === "relation" ? (
                      <RelationPicker
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        options={relationOptions[f.key] ?? []}
                        onPick={(v) => onPatch(row.id, { [f.key]: v })}
                        onJump={
                          onOpenRelation && f.relation
                            ? () => onOpenRelation(f.relation!, String(row[f.key] ?? ""))
                            : undefined
                        }
                        onCreate={onCreateRelation ? (title) => onCreateRelation(f.key, title) : undefined}
                      />
                    ) : f.type === "date" ? (
                      <DateField
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        onPick={(iso) => onPatch(row.id, { [f.key]: iso })}
                      />
                    ) : f.type === "boolean" ? (
                      <label style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                        <input
                          type="checkbox"
                          checked={row[f.key] === true}
                          data-testid={`field-${f.key}`}
                          onChange={(e) => onPatch(row.id, { [f.key]: e.target.checked })}
                        />
                        <span style={{ font: "var(--nx-text-meta)", color: "var(--nx-fg-muted)" }}>{row[f.key] === true ? "Yes" : "No"}</span>
                      </label>
                    ) : f.type === "rating" ? (
                      <span data-testid={`field-${f.key}`} style={{ letterSpacing: 2, cursor: "pointer", color: "var(--nx-warn)", fontSize: 15 }}>
                        {Array.from({ length: f.scale ?? 5 }, (_, i) => (
                          <span key={i} data-testid={`field-${f.key}-star-${i + 1}`}
                            onClick={() => onPatch(row.id, { [f.key]: i + 1 === row[f.key] ? 0 : i + 1 })}>
                            {i < (typeof row[f.key] === "number" ? (row[f.key] as number) : 0) ? "★" : "☆"}
                          </span>
                        ))}
                      </span>
                    ) : f.type === "dateTime" ? (
                      <input
                        className="nxCellEdit"
                        type="datetime-local"
                        key={`${f.key}:${String(row[f.key] ?? "")}`}
                        defaultValue={row[f.key] ? new Date(String(row[f.key])).toISOString().slice(0, 16) : ""}
                        aria-label={f.label}
                        data-testid={`field-${f.key}`}
                        onBlur={(e) => {
                          const v = e.target.value ? new Date(e.target.value).toISOString() : "";
                          if (v !== row[f.key]) onPatch(row.id, { [f.key]: v });
                        }}
                      />
                    ) : f.type === "longText" ? (
                      <textarea
                        className="nxCellEdit"
                        rows={3}
                        key={`${f.key}:${String(row[f.key] ?? "")}`}
                        defaultValue={String(row[f.key] ?? "")}
                        aria-label={f.label}
                        data-testid={`field-${f.key}`}
                        style={{ resize: "vertical", font: "var(--nx-text-body)" }}
                        onBlur={(e) => { if (e.target.value !== row[f.key]) onPatch(row.id, { [f.key]: e.target.value }); }}
                      />
                    ) : f.type === "richText" ? (
                      <RichTextField
                        /* keyed by row id → switching records reseeds, but a same-record
                           poll keeps the same key and never clobbers live edits */
                        key={`${row.id}:${f.key}:richtext`}
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        onSave={(nextBlocks) => onPatch(row.id, { [f.key]: nextBlocks })}
                        suggest={suggest && f.suggestTaskId ? {
                          suggestionsValue: row[`${f.key}__suggestions`],
                          requesting: suggest.requestingField === f.key,
                          readOnly,
                          onRequest: () => suggest.onRequest(f.key),
                          onPersist: (changes) => suggest.onPersist(f.key, changes),
                          pipelineStates: config.pipelineField
                            ? optionValues(config.fields.find((x) => x.key === config.pipelineField)?.options)
                            : undefined,
                          pipelineCurrent: config.pipelineField ? String(row[config.pipelineField] ?? "") : undefined,
                        } : undefined}
                      />
                    ) : f.type === "array" ? (
                      <ArrayField fieldKey={f.key} label={f.label} value={row[f.key]} onChange={(vals) => onPatch(row.id, { [f.key]: vals })} />
                    ) : f.type === "json" ? (
                      <textarea
                        className="nxCellEdit"
                        rows={3}
                        key={`${f.key}:${JSON.stringify(row[f.key] ?? null)}`}
                        defaultValue={row[f.key] == null ? "" : JSON.stringify(row[f.key], null, 2)}
                        aria-label={f.label}
                        data-testid={`field-${f.key}`}
                        style={{ resize: "vertical", font: "12px/1.5 var(--nx-font-mono)" }}
                        onBlur={(e) => {
                          if (!e.target.value.trim()) return onPatch(row.id, { [f.key]: null });
                          try { onPatch(row.id, { [f.key]: JSON.parse(e.target.value) }); }
                          catch { e.target.value = row[f.key] == null ? "" : JSON.stringify(row[f.key], null, 2); }
                        }}
                      />
                    ) : f.type === "select" ? (
                      <select
                        className="nxCellEdit"
                        value={String(row[f.key] ?? "")}
                        aria-label={f.label}
                        data-testid={`field-${f.key}`}
                        onChange={(e) => onPatch(row.id, { [f.key]: e.target.value })}
                      >
                        {optionValues(f.options).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.type === "money" ? (
                      <MoneyField
                        key={`${f.key}:${JSON.stringify(row[f.key] ?? null)}`}
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        onSave={(v) => onPatch(row.id, { [f.key]: v })}
                      />
                    ) : f.type === "emails" || f.type === "phones" || f.type === "links" ? (
                      <ListField
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        placeholder={f.type === "emails" ? "Add an email…" : f.type === "phones" ? "Add a phone…" : "Add a URL…"}
                        validate={listValidators[f.type](f.label)}
                        onSave={(vals) => onPatch(row.id, { [f.key]: vals })}
                      />
                    ) : f.type === "address" ? (
                      <AddressField
                        key={`${f.key}:${JSON.stringify(row[f.key] ?? null)}`}
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        onSave={(v) => onPatch(row.id, { [f.key]: v })}
                      />
                    ) : f.type === "fullName" ? (
                      <FullNameField
                        key={`${f.key}:${JSON.stringify(row[f.key] ?? null)}`}
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        onSave={(v) => onPatch(row.id, { [f.key]: v })}
                      />
                    ) : (
                      <input
                        className="nxCellEdit"
                        /* uncontrolled for typing; the key remounts it when the value
                           changes EXTERNALLY (enrich, another tab) so it re-renders */
                        key={`${f.key}:${String(row[f.key] ?? "")}`}
                        defaultValue={String(row[f.key] ?? "")}
                        aria-label={f.label}
                        data-testid={`field-${f.key}`}
                        onBlur={(e) => {
                          const v = f.type === "number" || f.type === "currency" ? Number(e.target.value) : e.target.value;
                          if (v !== row[f.key]) onPatch(row.id, { [f.key]: v });
                        }}
                      />
                    )}
                    {f.primitive && onEnrich && !readOnly && (
                      enrichingKey === f.key ? (
                        <ThinkingDots label={`Enriching ${f.label}`} data-testid={`enriching-${f.key}`} />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Sparkles size={12} />}
                          aria-label={`Enrich ${f.label}${f.primitive.label ? ` via ${f.primitive.label}` : ""}`}
                          data-testid={`enrich-${f.key}`}
                          onClick={() => onEnrich(f.key)}
                        />
                      )
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {related.map((rl) => (
            <div className="nxCard" key={rl.key} data-testid={`related-${rl.key}`}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--nx-border)", display: "flex", justifyContent: "space-between" }}>
                <Micro>{rl.label}</Micro>
                <span className="nxCount">{rl.rows.length}</span>
              </div>
              <div className="nxFieldList">
                {rl.rows.length === 0 && (
                  <div style={{ padding: "10px 12px", color: "var(--nx-fg-faint)", font: "var(--nx-text-meta)" }}>None yet.</div>
                )}
                {rl.rows.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="nxFieldRow"
                    data-testid={`related-${rl.key}-${r.id}`}
                    style={{ background: "none", border: 0, cursor: "pointer", width: "100%", gridTemplateColumns: "1fr auto" }}
                    onClick={() => rl.onOpen(r.id)}
                  >
                    <span className="nxRowLink" style={{ textAlign: "left" }}>{String(r[rl.primaryKey] ?? r.id)}</span>
                    {rl.metaKey && <span className="nxFieldLabel">{String(r[rl.metaKey] ?? "")}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="nxCard" style={{ padding: "8px 16px 16px" }}>
          <Tabs
            value={tab}
            onValueChange={setTab}
            tabs={[
              { value: "timeline", label: "Timeline" },
              { value: "notes", label: "Notes" },
              ...(files ? [{ value: "files", label: `Files${files.list.length ? ` (${files.list.length})` : ""}` }] : []),
            ]}
          >
            <TabPanel value="timeline">
              {onLogActivity && !readOnly && (
                <div style={{ display: "flex", gap: 8, margin: "14px 0", alignItems: "center", flexWrap: "wrap" }} data-testid="activity-composer">
                  <div className="nxSeg">
                    {ACTIVITY_KINDS.map((k) => (
                      <button
                        key={k.key}
                        type="button"
                        className="nxSegBtn"
                        data-active={actKind === k.key}
                        data-testid={`act-kind-${k.key}`}
                        onClick={() => setActKind(k.key)}
                      >
                        {k.icon} {k.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="nxInput"
                    style={{ flex: 1, minWidth: 160 }}
                    placeholder={`Log a ${actKind}…`}
                    value={actText}
                    data-testid="act-input"
                    onChange={(e) => setActText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && actText.trim()) {
                        onLogActivity(actKind, actText.trim());
                        setActText("");
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    data-testid="act-log"
                    onClick={() => {
                      if (actText.trim()) {
                        onLogActivity(actKind, actText.trim());
                        setActText("");
                      }
                    }}
                  >
                    Log
                  </Button>
                </div>
              )}
              <div className="nxTimeline" data-testid="timeline">
                {timeline.length === 0 && <div style={{ color: "var(--nx-fg-faint)", padding: 16 }}>No activity yet.</div>}
                {timeline.map((ev) => {
                  const ic = evIcon(ev);
                  return (
                    <div className="nxTlItem" key={ev.id}>
                      <div className="nxTlRail"><span className="nxTlIcon" data-testid={ic.tid}>{ic.node}</span></div>
                      <div className="nxTlBody">
                        <div className="nxTlSummary">{ev.summary}</div>
                        <div className="nxTlMeta">{new Date(ev.ts).toLocaleString()} {ev.actor ? `· ${ev.actor}` : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabPanel>
            {files && (
              <TabPanel value="files">
                {!readOnly && (
                <div style={{ display: "flex", margin: "14px 0" }}>
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    data-testid="file-input"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      prepareUpload(f).then((payload) => {
                        files.onUpload(payload);
                        if (fileInput.current) fileInput.current.value = "";
                      });
                    }}
                  />
                  <Button variant="primary" icon={<Upload size={13} />} data-testid="file-upload" onClick={() => fileInput.current?.click()}>
                    Upload file
                  </Button>
                </div>
                )}
                <div className="nxFieldList" data-testid="files-list">
                  {files.list.length === 0 && (
                    <div style={{ padding: 16, color: "var(--nx-fg-faint)" }}>No files yet.</div>
                  )}
                  {files.list.map((f) => (
                    <div className="nxFieldRow" key={f.id} data-testid={`file-row-${f.id}`} style={{ gridTemplateColumns: "auto 1fr auto auto" }}>
                      <span className="nxTlIcon"><Paperclip size={11} /></span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span className="nxFieldLabel">{formatBytes(f.size)} · {new Date(f.ts).toLocaleDateString()}</span>
                      <a
                        className="nxRowLink"
                        href={files.downloadHref(f.id)}
                        download={f.name}
                        data-testid={`file-dl-${f.id}`}
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              </TabPanel>
            )}
            <TabPanel value="notes">
              {!readOnly && (
              <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
                <input
                  className="nxInput"
                  placeholder="Add a note… (@ mentions notify)"
                  value={note}
                  data-testid="note-input"
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && note.trim()) {
                      onAddNote(note.trim());
                      setNote("");
                    }
                  }}
                />
                <Button
                  variant="primary"
                  data-testid="note-add"
                  onClick={() => {
                    if (note.trim()) {
                      onAddNote(note.trim());
                      setNote("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
              )}
              {!readOnly && (() => {
                const m = note.match(/@([\w]*)$/);
                if (!m) return null;
                const frag = m[1].toLowerCase();
                const hits = mentionOptions.filter((n) => n.toLowerCase().startsWith(frag)).slice(0, 5);
                if (hits.length === 0) return null;
                return (
                  <div style={{ display: "flex", gap: 6, margin: "-6px 0 10px", flexWrap: "wrap" }} data-testid="mention-suggest">
                    {hits.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="nxSegBtn"
                        style={{ border: "1px solid var(--nx-border)", borderRadius: 999 }}
                        data-testid={`mention-${n.replaceAll(/\W+/g, "-").toLowerCase()}`}
                        onClick={() => setNote(note.replace(/@[\w]*$/, `@${n} `))}
                      >
                        @{n}
                      </button>
                    ))}
                  </div>
                );
              })()}
              <div className="nxTimeline" data-testid="notes-list">
                {timeline.filter((t) => t.kind === "note").map((ev) => (
                  <div className="nxTlItem" key={ev.id}>
                    <div className="nxTlRail"><span className="nxTlDot" /></div>
                    <div className="nxTlBody">
                      <div className="nxTlSummary">{ev.summary}</div>
                      <div className="nxTlMeta">{new Date(ev.ts).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
