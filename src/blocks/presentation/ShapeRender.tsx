import * as React from "react";
import type { ShapeKind, SlideElement } from "./types";

/* Shapes draw as SVG in the element's own local box (0..w, 0..h), so rotation and
   scaling are handled by the layer above and the geometry here stays trivial.
   Fill/stroke accept CSS custom properties (e.g. var(--pres-accent)), which is
   what lets a shape re-colour with the deck theme instead of baking a hex. */

function path(shape: ShapeKind, w: number, h: number, r: number): string {
  switch (shape) {
    case "triangle":
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    case "arrow": {
      /* a shafted arrow pointing right, thickness relative to the box */
      const t = Math.min(h, h * 0.5);
      const head = Math.min(w * 0.35, h * 1.2);
      const y0 = (h - t) / 2;
      return `M 0 ${y0} L ${w - head} ${y0} L ${w - head} 0 L ${w} ${h / 2} L ${w - head} ${h} L ${w - head} ${y0 + t} L 0 ${y0 + t} Z`;
    }
    case "line":
      return `M 0 ${h / 2} L ${w} ${h / 2}`;
    case "star": {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2;
      const r2 = R * 0.4;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? R : r2;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`);
      }
      return `M ${pts.join(" L ")} Z`;
    }
    case "callout": {
      /* rounded body + a tail on the lower left, like a speech bubble */
      const body = h * 0.78;
      const rr = Math.min(r, body / 2, w / 2);
      const tailX = Math.min(w * 0.28, 120);
      return [
        `M ${rr} 0`,
        `H ${w - rr}`,
        `A ${rr} ${rr} 0 0 1 ${w} ${rr}`,
        `V ${body - rr}`,
        `A ${rr} ${rr} 0 0 1 ${w - rr} ${body}`,
        `H ${tailX + 48}`,
        `L ${tailX} ${h}`,
        `L ${tailX + 8} ${body}`,
        `H ${rr}`,
        `A ${rr} ${rr} 0 0 1 0 ${body - rr}`,
        `V ${rr}`,
        `A ${rr} ${rr} 0 0 1 ${rr} 0`,
        "Z",
      ].join(" ");
    }
    default:
      return "";
  }
}

export function ShapeSvg({ el }: { el: SlideElement }) {
  const { w, h } = el;
  const shape = el.shape ?? "rect";
  const st = el.style ?? {};
  const fill = st.fill && st.fill !== "none" ? st.fill : "none";
  const stroke = st.stroke && st.stroke !== "none" ? st.stroke : "none";
  const strokeWidth = st.strokeWidth ?? 0;
  const common = {
    fill,
    fillOpacity: st.fillOpacity ?? 1,
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <svg className="nxPresShapeSvg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none" aria-hidden="true">
      {shape === "rect" && <rect x={0} y={0} width={w} height={h} {...common} />}
      {shape === "roundRect" && <rect x={0} y={0} width={w} height={h} rx={st.radius ?? 16} ry={st.radius ?? 16} {...common} />}
      {shape === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />}
      {shape !== "rect" && shape !== "roundRect" && shape !== "ellipse" && (
        <path d={path(shape, w, h, st.radius ?? 16)} {...common} />
      )}
    </svg>
  );
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: "Rectangle",
  roundRect: "Rounded",
  ellipse: "Ellipse",
  triangle: "Triangle",
  arrow: "Arrow",
  line: "Line",
  star: "Star",
  callout: "Callout",
};

/* tiny glyph for the insert menu — same geometry, drawn in a 24x24 box */
export function ShapeGlyph({ shape }: { shape: ShapeKind }) {
  const w = 20;
  const h = 20;
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg width="24" height="24" viewBox="-2 -2 24 24" aria-hidden="true">
      {shape === "rect" && <rect x={0} y={3} width={w} height={h - 6} {...common} />}
      {shape === "roundRect" && <rect x={0} y={3} width={w} height={h - 6} rx={4} {...common} />}
      {shape === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2 - 2} {...common} />}
      {shape !== "rect" && shape !== "roundRect" && shape !== "ellipse" && <path d={path(shape, w, h, 5)} {...common} />}
    </svg>
  );
}
