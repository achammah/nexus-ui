/* Plan2D — the true 2D technical drawing (SVG, orthographic top-down). This is
   deliberately NOT the WebGL scene from above: architectural plan conventions —
   double-line walls, door swing arcs, chain dimensions with extension lines and
   oblique ticks, a scale bar, north arrow and title block — are linework, and
   SVG keeps them crisp at any zoom and trivially exportable to print-res PNG.
   Every number printed here derives from the same plan-geometry math the 3D
   walls are built from. */
import * as React from "react";
import {
  formatArea, formatDim, formatLen, gridStops, levelWalls, nearestScale,
  openingsOnWall, polyArea, polyBounds, polyCentroid, roomDims, scaleBarLength,
  solidSpans, lerp2, type P2,
} from "./plan-geometry";
import type { PlanPalette } from "./look";
import type { Viewer3DFloorplanConfig, Viewer3DHotspot, Viewer3DLevel, Viewer3DUnits } from "./scene";

export interface Plan2DProps {
  floorplan: Viewer3DFloorplanConfig;
  level: Viewer3DLevel;
  units: Viewer3DUnits;
  palette: PlanPalette;
  hotspots: Viewer3DHotspot[];
  measuring: boolean;
  onHotspot?: (h: Viewer3DHotspot) => void;
}

export interface Plan2DHandle {
  /* rasterize the current sheet to a PNG data URL at print resolution */
  exportPng: (pxWidth?: number) => Promise<string>;
}

/* sheet margins (meters of plan space) */
const PAD_L = 2.1, PAD_T = 2.0, PAD_R = 2.0, PAD_B = 0.9;
const TITLE_H = 1.7;

const T_TXT = 0.26;   // room name font size (m)
const T_SUB = 0.2;    // secondary text
const T_DIM = 0.19;   // dimension text

export const Plan2D = React.forwardRef<Plan2DHandle, Plan2DProps>(function Plan2D(
  { floorplan, level, units, palette: C, hotspots, measuring, onHotspot }, ref,
) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [pts, setPts] = React.useState<P2[]>([]);
  const [hover, setHover] = React.useState<P2 | null>(null);

  const tExt = floorplan.wallThickness ?? 0.15;
  const tInt = Math.max(tExt * 0.6, 0.08);
  const meta = floorplan.meta ?? {};

  const b = polyBounds(level.rooms.map((r) => r.poly));
  const W = b.maxX - b.minX, H = b.maxZ - b.minZ;
  const titleW = Math.max(6.4, W * 0.62);
  const vb = {
    x: b.minX - PAD_L,
    y: b.minZ - PAD_T,
    w: W + PAD_L + PAD_R,
    h: H + PAD_T + PAD_B + TITLE_H + 0.5,
  };

  const walls = React.useMemo(() => levelWalls(level), [level]);
  const stops = React.useMemo(() => gridStops(level), [level]);

  /* client point -> plan meters (snapped) */
  const toPlan = (ev: React.PointerEvent): P2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    const snap = (v: number) => Math.round(v * 20) / 20;
    return [snap(p.x), snap(p.y)];
  };

  const onClick = (ev: React.PointerEvent) => {
    if (!measuring) return;
    const p = toPlan(ev);
    if (!p) return;
    setPts((cur) => (cur.length >= 2 ? [p] : [...cur, p]));
  };
  const onMove = (ev: React.PointerEvent) => {
    if (!measuring || pts.length !== 1) return;
    setHover(toPlan(ev));
  };
  React.useEffect(() => { if (!measuring) { setPts([]); setHover(null); } }, [measuring]);

  React.useImperativeHandle(ref, () => ({
    exportPng: (pxWidth = 3300) => new Promise((resolve, reject) => {
      const svg = svgRef.current;
      if (!svg) return reject(new Error("plan not mounted"));
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const pxH = Math.round((vb.h / vb.w) * pxWidth);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(pxWidth));
      clone.setAttribute("height", String(pxH));
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = pxWidth; canvas.height = pxH;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); return reject(new Error("no 2d context")); }
        ctx.fillStyle = C.paper;
        ctx.fillRect(0, 0, pxWidth, pxH);
        ctx.drawImage(img, 0, 0, pxWidth, pxH);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG rasterization failed")); };
      img.src = url;
    }),
  }), [vb.w, vb.h, C.paper]);

  /* ---- dimension helpers (SVG fragments) ---- */

  const tick = (x: number, y: number, key: string) => (
    <line key={key} x1={x - 0.09} y1={y + 0.09} x2={x + 0.09} y2={y - 0.09} stroke={C.dims} strokeWidth={0.035} />
  );

  /* horizontal chain at yLine using stop xs; extension lines drop from yFrom */
  const chainH = (xs: number[], yLine: number, yFrom: number, id: string, overall = false) => {
    if (xs.length < 2) return null;
    const items: React.ReactNode[] = [];
    items.push(<line key="l" x1={xs[0]} y1={yLine} x2={xs[xs.length - 1]} y2={yLine} stroke={C.dims} strokeWidth={0.03} />);
    xs.forEach((x, i) => {
      items.push(<line key={`e${i}`} x1={x} y1={yFrom - 0.15} x2={x} y2={yLine - 0.18} stroke={C.dims} strokeWidth={0.02} />);
      items.push(tick(x, yLine, `t${i}`));
    });
    for (let i = 0; i < xs.length - 1; i++) {
      const seg = xs[i + 1] - xs[i];
      if (seg < 0.28 && !overall) continue;
      items.push(
        <text key={`x${i}`} x={(xs[i] + xs[i + 1]) / 2} y={yLine - 0.09} fontSize={T_DIM} fill={C.dims}
          textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">{formatDim(seg, units)}</text>,
      );
    }
    return <g key={id} data-testid={`plan-dim-${id}`}>{items}</g>;
  };

  const chainV = (zs: number[], xLine: number, xFrom: number, id: string, overall = false) => {
    if (zs.length < 2) return null;
    const items: React.ReactNode[] = [];
    items.push(<line key="l" x1={xLine} y1={zs[0]} x2={xLine} y2={zs[zs.length - 1]} stroke={C.dims} strokeWidth={0.03} />);
    zs.forEach((z, i) => {
      items.push(<line key={`e${i}`} x1={xFrom - 0.15} y1={z} x2={xLine + 0.18} y2={z} stroke={C.dims} strokeWidth={0.02} />);
      items.push(tick(xLine, z, `t${i}`));
    });
    for (let i = 0; i < zs.length - 1; i++) {
      const seg = zs[i + 1] - zs[i];
      if (seg < 0.28 && !overall) continue;
      const cy = (zs[i] + zs[i + 1]) / 2;
      items.push(
        <text key={`z${i}`} x={xLine - 0.09} y={cy} fontSize={T_DIM} fill={C.dims} textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif" transform={`rotate(-90 ${xLine - 0.09} ${cy})`}>{formatDim(seg, units)}</text>,
      );
    }
    return <g key={id} data-testid={`plan-dim-${id}`}>{items}</g>;
  };

  /* ---- openings ---- */

  const openingSymbols: React.ReactNode[] = [];
  const openingErase: React.ReactNode[] = [];
  walls.forEach((wall, wi) => {
    const t = wall.shared ? tInt : tExt;
    const ops = openingsOnWall(wall, level.openings);
    ops.forEach(({ opening, t0, t1 }, oi) => {
      const a = lerp2(wall.a, wall.b, t0), c = lerp2(wall.a, wall.b, t1);
      const w = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const ux = (c[0] - a[0]) / w, uz = (c[1] - a[1]) / w;
      openingErase.push(
        <line key={`er-${wi}-${oi}`} x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} stroke={C.paper} strokeWidth={t + 0.02} />,
      );
      if (opening.kind === "door") {
        const swing = opening.swing ?? 1;
        /* hinge at `a`; leaf swings to the +90°(swing) side of the wall */
        const px = -uz * swing, pz = ux * swing;
        const L: P2 = [a[0] + px * w, a[1] + pz * w];
        const sweep = swing === 1 ? 0 : 1;
        openingSymbols.push(
          <g key={`d-${wi}-${oi}`} data-testid={`plan-door-${opening.id}`}>
            <line x1={a[0]} y1={a[1]} x2={L[0]} y2={L[1]} stroke={C.ink} strokeWidth={0.04} />
            <path d={`M ${L[0]} ${L[1]} A ${w} ${w} 0 0 ${sweep} ${c[0]} ${c[1]}`} fill="none" stroke={C.muted} strokeWidth={0.022} strokeDasharray="0.09 0.07" />
          </g>,
        );
      } else {
        /* window: jamb-to-jamb frame + central glazing line */
        const px = -uz, pz = ux;
        const ht = t * 0.5;
        openingSymbols.push(
          <g key={`w-${wi}-${oi}`} data-testid={`plan-window-${opening.id}`}>
            <rect x={0} y={0} width={w} height={t}
              transform={`translate(${a[0] - px * ht} ${a[1] - pz * ht}) rotate(${(Math.atan2(uz, ux) * 180) / Math.PI})`}
              fill={C.paper} stroke={C.ink} strokeWidth={0.028} />
            <line x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} stroke={C.glass} strokeWidth={0.045} />
          </g>,
        );
      }
    });
  });

  /* ---- title block rows ---- */
  const scaleLabel = meta.scale ?? nearestScale(
    (svgRef.current?.clientWidth ?? 900) / vb.w,
  );
  const barLen = scaleBarLength(W);

  const measureLen = pts.length === 2
    ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
    : pts.length === 1 && hover ? Math.hypot(hover[0] - pts[0][0], hover[1] - pts[0][1]) : null;
  const mEnd = pts.length === 2 ? pts[1] : hover;

  const titleX = b.maxX + PAD_R - 0.25 - titleW;
  const titleY = b.maxZ + PAD_B + 0.35;

  return (
    <svg
      ref={svgRef}
      className={`nxV3Plan${measuring ? " nxV3Plan--measure" : ""}`}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      data-testid="plan2d"
      role="img"
      aria-label={`Technical floor plan of ${level.name}: ${level.rooms.length} rooms, ${formatArea(level.rooms.reduce((s, r) => s + polyArea(r.poly), 0), units)}`}
      style={{ background: C.paper }}
      onPointerDown={onClick}
      onPointerMove={onMove}
    >
      {/* sheet frame */}
      <rect x={vb.x + 0.12} y={vb.y + 0.12} width={vb.w - 0.24} height={vb.h - 0.24}
        fill="none" stroke={C.ink} strokeWidth={0.035} />

      {/* room floors */}
      {level.rooms.map((r, i) => (
        <polygon key={r.id} data-testid={`plan-room-${r.id}`}
          points={r.poly.map(([x, z]) => `${x},${z}`).join(" ")}
          fill={i % 2 === 0 ? C.floorA : C.floorB} stroke="none" />
      ))}

      {/* walls (double-line effect: one thick ink stroke per deduped wall) */}
      {walls.map((wl, i) => (
        <line key={i} x1={wl.a[0]} y1={wl.a[1]} x2={wl.b[0]} y2={wl.b[1]}
          stroke={C.ink} strokeWidth={wl.shared ? tInt : tExt} strokeLinecap="square" />
      ))}
      {openingErase}
      {openingSymbols}

      {/* room labels: name, envelope dims, area */}
      {level.rooms.map((r) => {
        const [cx, cz] = polyCentroid(r.poly);
        const { w, d } = roomDims(r);
        const small = polyArea(r.poly) < 4;
        return (
          <g key={r.id} textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">
            <text x={cx} y={cz - (small ? 0.1 : 0.24)} fontSize={small ? T_SUB : T_TXT} fill={C.ink}
              letterSpacing={0.03} style={{ textTransform: "uppercase" }} fontWeight={600}>{r.label}</text>
            {!small && (
              <text x={cx} y={cz + 0.12} fontSize={T_SUB} fill={C.muted}>
                {formatLen(w, units)} × {formatLen(d, units)}
              </text>
            )}
            <text x={cx} y={cz + (small ? 0.22 : 0.44)} fontSize={T_SUB} fill={C.muted} data-testid={`plan-area-${r.id}`}>
              {formatArea(polyArea(r.poly), units)}
            </text>
          </g>
        );
      })}

      {/* hotspot markers */}
      {hotspots.map((h) => (
        <g key={h.id} data-testid={`plan-hotspot-${h.id}`} onClick={() => onHotspot?.(h)} style={{ cursor: "pointer" }}>
          <circle cx={h.position[0]} cy={h.position[2]} r={0.17} fill={C.tones[h.tone ?? "accent"]} opacity={0.92} />
          <circle cx={h.position[0]} cy={h.position[2]} r={0.28} fill="none" stroke={C.tones[h.tone ?? "accent"]} strokeWidth={0.03} opacity={0.55} />
          <title>{h.label}</title>
        </g>
      ))}

      {/* chain dimensions: per-wall-stop row + overall, top and left */}
      {chainH(stops.xs, b.minZ - 0.75, b.minZ, "top-chain")}
      {chainH([b.minX, b.maxX], b.minZ - 1.35, b.minZ, "top-overall", true)}
      {chainV(stops.zs, b.minX - 0.75, b.minX, "left-chain")}
      {chainV([b.minZ, b.maxZ], b.minX - 1.35, b.minX, "left-overall", true)}

      {/* measure tool */}
      {measuring && pts.length > 0 && mEnd && (
        <g data-testid="plan-measure">
          <line x1={pts[0][0]} y1={pts[0][1]} x2={mEnd[0]} y2={mEnd[1]} stroke={C.accent} strokeWidth={0.045} strokeDasharray="0.14 0.09" />
          <circle cx={pts[0][0]} cy={pts[0][1]} r={0.07} fill={C.accent} />
          <circle cx={mEnd[0]} cy={mEnd[1]} r={0.07} fill={C.accent} />
          {measureLen !== null && measureLen > 0.01 && (
            <text x={(pts[0][0] + mEnd[0]) / 2} y={(pts[0][1] + mEnd[1]) / 2 - 0.16} fontSize={T_TXT} fill={C.accent}
              textAnchor="middle" fontWeight={700} fontFamily="ui-sans-serif, system-ui, sans-serif"
              stroke={C.paper} strokeWidth={0.09} paintOrder="stroke" data-testid="plan-measure-value">
              {formatLen(measureLen, units)}
            </text>
          )}
        </g>
      )}

      {/* north arrow (top-right) */}
      <g transform={`translate(${b.maxX + PAD_R - 0.95} ${b.minZ - PAD_T + 1.0}) rotate(${meta.northDeg ?? 0})`} data-testid="plan-north">
        <circle r={0.42} fill="none" stroke={C.ink} strokeWidth={0.035} />
        <path d="M 0 -0.34 L 0.13 0.18 L 0 0.08 L -0.13 0.18 Z" fill={C.ink} />
        <text y={-0.52} fontSize={T_SUB} fill={C.ink} textAnchor="middle" fontWeight={700}
          fontFamily="ui-sans-serif, system-ui, sans-serif">N</text>
      </g>

      {/* scale bar (bottom-left) */}
      <g transform={`translate(${b.minX} ${b.maxZ + PAD_B + 0.55})`} data-testid="plan-scalebar">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={(barLen / 4) * i} y={0} width={barLen / 4} height={0.16}
            fill={i % 2 === 0 ? C.ink : C.paper} stroke={C.ink} strokeWidth={0.02} />
        ))}
        <text x={0} y={0.42} fontSize={T_DIM} fill={C.muted} fontFamily="ui-sans-serif, system-ui, sans-serif">0</text>
        <text x={barLen} y={0.42} fontSize={T_DIM} fill={C.muted} textAnchor="end"
          fontFamily="ui-sans-serif, system-ui, sans-serif">{formatLen(barLen, units)}</text>
      </g>

      {/* title block (bottom-right) */}
      <g data-testid="plan-titleblock" fontFamily="ui-sans-serif, system-ui, sans-serif">
        <rect x={titleX} y={titleY} width={titleW} height={TITLE_H} fill={C.paper} stroke={C.ink} strokeWidth={0.035} />
        <line x1={titleX} y1={titleY + 0.62} x2={titleX + titleW} y2={titleY + 0.62} stroke={C.ink} strokeWidth={0.02} />
        <line x1={titleX + titleW * 0.55} y1={titleY} x2={titleX + titleW * 0.55} y2={titleY + TITLE_H} stroke={C.ink} strokeWidth={0.02} />
        <text x={titleX + 0.18} y={titleY + 0.4} fontSize={0.3} fill={C.ink} fontWeight={700}>{meta.project ?? "Floor plan"}</text>
        <text x={titleX + 0.18} y={titleY + 0.95} fontSize={T_SUB} fill={C.muted}>{meta.address ?? ""}</text>
        <text x={titleX + 0.18} y={titleY + 1.3} fontSize={T_SUB} fill={C.muted}>{meta.client ?? ""}</text>
        <text x={titleX + titleW * 0.55 + 0.18} y={titleY + 0.4} fontSize={T_SUB} fill={C.ink} fontWeight={600}>
          {level.name} · {scaleLabel}
        </text>
        {[
          ["Drawn", meta.drawnBy ?? "—"],
          ["Date", meta.date ?? "—"],
          [`Sheet ${meta.sheet ?? "A-101"}`, `Rev ${meta.revision ?? "A"}`],
        ].map(([k, v], i) => (
          <text key={i} x={titleX + titleW * 0.55 + 0.18} y={titleY + 0.78 + i * 0.3} fontSize={T_DIM} fill={C.muted}>
            {k}   {v}
          </text>
        ))}
      </g>
    </svg>
  );
});

export default Plan2D;
