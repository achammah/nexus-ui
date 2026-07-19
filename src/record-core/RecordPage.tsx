import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../primitives/Button";
import { Badge, Micro, Tabs, TabPanel } from "../primitives/fields";
import type { ObjectConfig, RecordRow, TimelineEvent } from "./types";
import "./record-core.css";

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
}: {
  config: ObjectConfig;
  row: RecordRow;
  timeline: TimelineEvent[];
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onBack: () => void;
  onAddNote: (text: string) => void;
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
                    {f.type === "select" ? (
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
