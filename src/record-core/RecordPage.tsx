import * as React from "react";
import { ArrowLeft, CalendarIcon, ChevronsUpDown, ExternalLink } from "lucide-react";
import { Button } from "../primitives/Button";
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
import type { ObjectConfig, RecordRow, TimelineEvent } from "./types";
import "./record-core.css";

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
  options: string[];
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
            <span
              key={t}
              data-testid={`field-${fieldKey}-chip-${t.replaceAll(/\W+/g, "-").toLowerCase()}`}
              style={{
                font: "var(--nx-text-meta)", fontWeight: 600, borderRadius: 999,
                padding: "1px 8px", background: "var(--nx-accent-soft)", color: "var(--nx-accent)",
              }}
            >
              {t}
            </span>
          ))}
          <ChevronsUpDown size={12} style={{ color: "var(--nx-fg-faint)", marginLeft: "auto", flex: "none" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: 240, padding: 0 }}>
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((o) => {
                const on = vals.includes(o);
                return (
                  <CommandItem
                    key={o}
                    value={o}
                    data-testid={`field-${fieldKey}-opt-${o.replaceAll(/\W+/g, "-").toLowerCase()}`}
                    onSelect={() => onChange(on ? vals.filter((x) => x !== o) : [...vals, o])}
                  >
                    <span style={{ width: 14, textAlign: "center" }}>{on ? "✓" : ""}</span>
                    {o}
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

/* Relation picker — combobox over the target object's primary values. */
function RelationPicker({
  fieldKey,
  label,
  value,
  options,
  onPick,
  onJump,
}: {
  fieldKey: string;
  label: string;
  value: unknown;
  options: string[];
  onPick: (v: string) => void;
  onJump?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
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
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} data-testid={`field-${fieldKey}-search`} />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o}
                    value={o}
                    data-testid={`field-${fieldKey}-opt-${o.replaceAll(/\W+/g, "-").toLowerCase()}`}
                    onSelect={() => {
                      onPick(o);
                      setOpen(false);
                    }}
                  >
                    {o}
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
  onOpenRelation,
  related = [],
  userOptions = [],
}: {
  config: ObjectConfig;
  row: RecordRow;
  timeline: TimelineEvent[];
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onBack: () => void;
  onAddNote: (text: string) => void;
  /* relation fieldKey → the target object's primary values (consumer-fetched) */
  relationOptions?: Record<string, string[]>;
  onOpenRelation?: (targetObject: string, value: string) => void;
  related?: RelatedList[];
  /* the app's people directory — `user` fields pick from it */
  userOptions?: string[];
}) {
  const primary = config.fields.find((f) => f.primary) ?? config.fields[0];
  const stageField = config.fields.find((f) => f.key === config.stageField);
  const [tab, setTab] = React.useState("timeline");
  const [note, setNote] = React.useState("");

  return (
    <div data-testid={`record-${row.id}`}>
      <div className="nxRecordHead">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack} aria-label="Back" />
        <h1 className="nxRecordName" data-testid="record-name">{String(row[primary.key] ?? "—")}</h1>
        {stageField && (
          <Badge tone="accent" dot>
            <span data-testid="record-stage">{String(row[stageField.key] ?? "—")}</span>
          </Badge>
        )}
        <Micro>{config.labelOne}</Micro>
      </div>

      <div className="nxRecord">
        <div className="nxRecordSide">
          <div className="nxCard">
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--nx-border)" }}>
              <Micro>Details</Micro>
            </div>
            <div className="nxFieldList">
              {config.fields.map((f) => (
                <div className="nxFieldRow" key={f.key}>
                  <span className="nxFieldLabel">{f.label}</span>
                  <span className="nxFieldValue">
                    {f.type === "user" ? (
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
                      />
                    ) : f.type === "date" ? (
                      <DateField
                        fieldKey={f.key}
                        label={f.label}
                        value={row[f.key]}
                        onPick={(iso) => onPatch(row.id, { [f.key]: iso })}
                      />
                    ) : f.type === "select" ? (
                      <select
                        className="nxCellEdit"
                        value={String(row[f.key] ?? "")}
                        aria-label={f.label}
                        data-testid={`field-${f.key}`}
                        onChange={(e) => onPatch(row.id, { [f.key]: e.target.value })}
                      >
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="nxCellEdit"
                        defaultValue={String(row[f.key] ?? "")}
                        aria-label={f.label}
                        data-testid={`field-${f.key}`}
                        onBlur={(e) => {
                          const v = f.type === "number" || f.type === "currency" ? Number(e.target.value) : e.target.value;
                          if (v !== row[f.key]) onPatch(row.id, { [f.key]: v });
                        }}
                      />
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
            ]}
          >
            <TabPanel value="timeline">
              <div className="nxTimeline" data-testid="timeline">
                {timeline.length === 0 && <div style={{ color: "var(--nx-fg-faint)", padding: 16 }}>No activity yet.</div>}
                {timeline.map((ev) => (
                  <div className="nxTlItem" key={ev.id}>
                    <div className="nxTlRail"><span className="nxTlDot" /></div>
                    <div className="nxTlBody">
                      <div className="nxTlSummary">{ev.summary}</div>
                      <div className="nxTlMeta">{new Date(ev.ts).toLocaleString()} {ev.actor ? `· ${ev.actor}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TabPanel>
            <TabPanel value="notes">
              <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
                <input
                  className="nxInput"
                  placeholder="Add a note…"
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
