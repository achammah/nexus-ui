import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ChartSpec, SlideElement } from "./types";

/* Charts reuse the library the app already ships (recharts) rather than adding
   another one — but they are behind a LAZY import (see ChartLazy below), so a
   deck with no chart never loads it.

   Rendering is FIXED-SIZE, not responsive: the element already knows its size in
   design px and the slide box is scaled by a CSS transform, so measuring the DOM
   (ResponsiveContainer) would fight that transform. Fixed width/height keeps a
   chart pixel-identical in the filmstrip, the canvas, present mode and export. */

/* Series colours derive from the deck theme, so a chart re-skins with the deck
   instead of carrying its own hardcoded palette. */
const SERIES_COLORS = [
  "var(--pres-accent)",
  "color-mix(in srgb, var(--pres-accent) 55%, var(--pres-fg))",
  "color-mix(in srgb, var(--pres-accent) 30%, var(--pres-muted))",
  "var(--pres-muted)",
  "color-mix(in srgb, var(--pres-accent) 70%, white)",
  "color-mix(in srgb, var(--pres-fg) 60%, var(--pres-muted))",
];
export const seriesColor = (i: number): string => SERIES_COLORS[i % SERIES_COLORS.length];

type Row = Record<string, string | number>;

const toRows = (spec: ChartSpec): Row[] =>
  spec.rows.map((r) => {
    const row: Row = { label: r.label };
    spec.series.forEach((s, i) => {
      row[s] = r.values[i] ?? 0;
    });
    return row;
  });

export function ChartRender({ el }: { el: SlideElement }) {
  const spec = el.chart;
  if (!spec) return null;
  const w = Math.max(80, el.w);
  const h = Math.max(60, el.h);
  const data = toRows(spec);
  const axisStyle = { fontSize: 13, fill: "var(--pres-muted)" };
  const common = { width: w, height: h, data, margin: { top: 12, right: 16, bottom: spec.xLabel ? 24 : 8, left: 4 } };
  const grid = spec.showGrid !== false ? <CartesianGrid strokeDasharray="3 3" stroke="var(--pres-muted)" strokeOpacity={0.25} /> : null;
  const legend = spec.showLegend !== false ? <Legend wrapperStyle={{ fontSize: 13, color: "var(--pres-muted)" }} /> : null;
  /* the deck is a static document: no hover tooltips in present/export, but the
     editor keeps them so an author can check values while placing the chart */
  const tip = <Tooltip cursor={{ fill: "var(--pres-muted)", fillOpacity: 0.12 }} />;

  switch (spec.type) {
    case "line":
      return (
        <LineChart {...common}>
          {grid}
          <XAxis dataKey="label" tick={axisStyle} stroke="var(--pres-muted)" label={xLabel(spec)} />
          <YAxis tick={axisStyle} stroke="var(--pres-muted)" />
          {tip}
          {legend}
          {spec.series.map((s, i) => (
            <Line key={s} type="monotone" dataKey={s} stroke={seriesColor(i)} strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
          ))}
        </LineChart>
      );
    case "area":
      return (
        <AreaChart {...common}>
          {grid}
          <XAxis dataKey="label" tick={axisStyle} stroke="var(--pres-muted)" label={xLabel(spec)} />
          <YAxis tick={axisStyle} stroke="var(--pres-muted)" />
          {tip}
          {legend}
          {spec.series.map((s, i) => (
            <Area key={s} type="monotone" dataKey={s} stroke={seriesColor(i)} fill={seriesColor(i)} fillOpacity={0.28} strokeWidth={3} isAnimationActive={false} />
          ))}
        </AreaChart>
      );
    case "pie":
      return (
        <PieChart width={w} height={h}>
          {tip}
          {legend}
          <Pie
            data={data}
            dataKey={spec.series[0] ?? "value"}
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={Math.min(w, h) * 0.36}
            isAnimationActive={false}
            label={{ fontSize: 13, fill: "var(--pres-fg)" }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} />
            ))}
          </Pie>
        </PieChart>
      );
    case "scatter":
      return (
        <ScatterChart {...common}>
          {grid}
          <XAxis dataKey={spec.series[0]} type="number" tick={axisStyle} stroke="var(--pres-muted)" name={spec.series[0]} />
          <YAxis dataKey={spec.series[1] ?? spec.series[0]} type="number" tick={axisStyle} stroke="var(--pres-muted)" name={spec.series[1]} />
          <ZAxis range={[60, 60]} />
          {tip}
          {legend}
          <Scatter data={data} fill={seriesColor(0)} isAnimationActive={false} />
        </ScatterChart>
      );
    default:
      return (
        <BarChart {...common}>
          {grid}
          <XAxis dataKey="label" tick={axisStyle} stroke="var(--pres-muted)" label={xLabel(spec)} />
          <YAxis tick={axisStyle} stroke="var(--pres-muted)" />
          {tip}
          {legend}
          {spec.series.map((s, i) => (
            <Bar key={s} dataKey={s} fill={seriesColor(i)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      );
  }
}

const xLabel = (spec: ChartSpec) =>
  spec.xLabel ? { value: spec.xLabel, position: "insideBottom" as const, offset: -4, fill: "var(--pres-muted)", fontSize: 13 } : undefined;

export default ChartRender;
