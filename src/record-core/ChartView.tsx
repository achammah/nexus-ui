import * as React from "react";
import type { ObjectConfig, RecordRow } from "./types";
import "./record-core.css";

/* ChartView — the third view family: one bar per group option, measuring Count
   or the sum of any numeric field. Reads the SAME group config the board uses
   (a new entity gets charts for free; no separate query surface). Zero-dep SVG-
   free rendering: plain flex bars driven by tokens. */

export function ChartView({
  config,
  rows,
  groupField,
  groupOptions,
  measure = "count",
}: {
  config: ObjectConfig;
  rows: RecordRow[];
  /* group by any select/user field — defaults to the config's stageField */
  groupField?: string;
  /* column set override (required for `user` fields — options live in app config) */
  groupOptions?: string[];
  /* "count" or a number/currency field key to SUM per group */
  measure?: string;
}) {
  const groupKey = groupField ?? config.stageField;
  const field = config.fields.find((f) => f.key === groupKey);
  const groups = groupOptions ?? field?.options ?? [];
  const measureField = measure === "count" ? undefined : config.fields.find((f) => f.key === measure);

  if (!field || groups.length === 0)
    return <div className="nxCard" style={{ padding: 20 }}>This object has no groupable field — chart unavailable.</div>;

  const value = (group: string) => {
    const bucket = rows.filter((r) => r[field.key] === group);
    if (!measureField) return bucket.length;
    return bucket.reduce((acc, r) => acc + (typeof r[measureField.key] === "number" ? (r[measureField.key] as number) : 0), 0);
  };
  const data = groups.map((g) => ({ group: g, value: value(g) }));
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

  return (
    <div className="nxCard nxChartCard" data-testid={`chart-${config.key}`}>
      <div className="nxChartTitle">
        {measureField ? `${measureField.label} by ${field.label}` : `${config.label} by ${field.label}`}
      </div>
      <div className="nxChart">
        {data.map((d) => (
          <div className="nxChartCol" key={d.group}>
            <span className="nxChartValue">{fmt(d.value)}</span>
            <div
              className="nxBar"
              data-testid={`bar-${d.group}`}
              data-value={d.value}
              style={{ height: `${Math.max(4, Math.round((d.value / max) * 180))}px` }}
              role="img"
              aria-label={`${d.group}: ${fmt(d.value)}`}
            />
            <span className="nxChartLabel" title={d.group}>{d.group}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
