/* The technical APRON — the persistent CAD-style dock beside the drawing:
   selected element's real specification (editable), layer visibility, the level
   tree, editable sheet/title-block metadata, and the room schedule as a docked
   pane. Everything it prints derives from the same plan-geometry math as the
   drawing; everything it edits funnels through plan-edit so a typed value and a
   dragged value obey identical snaps/clamps. */
import * as React from "react";
import {
  formatArea, formatLen, levelArea, levelWalls, openingsOnWall, polyArea, roomDims,
} from "./plan-geometry";
import { findOpening, wallOfOpening } from "./plan-edit";
import type {
  Viewer3DFloorplanConfig, Viewer3DLayers, Viewer3DLevel, Viewer3DOpening,
  Viewer3DPlanMeta, Viewer3DRoom, Viewer3DSelection, Viewer3DUnits,
} from "./scene";

export interface ApronProps {
  floorplan: Viewer3DFloorplanConfig;
  activeLevel: string;
  selection: Viewer3DSelection;
  units: Viewer3DUnits;
  layers: Viewer3DLayers;
  onSelect: (sel: Viewer3DSelection) => void;
  onLevel: (id: string) => void;
  onPatchRoom: (levelId: string, roomId: string, patch: Partial<Viewer3DRoom>) => void;
  onPatchOpening: (levelId: string, openingId: string, patch: Partial<Viewer3DOpening>) => void;
  onResizeOpening: (levelId: string, openingId: string, width: number) => void;
  onPatchMeta: (patch: Partial<Viewer3DPlanMeta>) => void;
  onLayers: (patch: Partial<Viewer3DLayers>) => void;
  onClose: () => void;
}

/* controlled text input that commits on blur/Enter (typing never thrashes the model) */
function Field({ label, value, onCommit, type = "text", step, testid }: {
  label: string; value: string | number; onCommit: (v: string) => void;
  type?: string; step?: number; testid?: string;
}) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => { setV(String(value)); }, [value]);
  return (
    <label className="nxV3Field">
      <span>{label}</span>
      <input
        type={type} step={step} value={v} data-testid={testid}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== String(value) && onCommit(v)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </label>
  );
}

const Row = ({ k, v, testid }: { k: string; v: React.ReactNode; testid?: string }) => (
  <div className="nxV3PropRow"><span>{k}</span><span data-testid={testid}>{v}</span></div>
);

export function Apron(props: ApronProps) {
  const { floorplan: fp, activeLevel, selection, units, layers } = props;
  const level = fp.levels.find((l) => l.id === activeLevel) ?? fp.levels[0];
  const meta = fp.meta ?? {};
  const t = fp.wallThickness ?? 0.15;

  /* ---- selection properties ---- */
  let props_: React.ReactNode;
  if (selection?.kind === "room") {
    const lvl = fp.levels.find((l) => l.id === selection.level);
    const room = lvl?.rooms.find((r) => r.id === selection.id);
    if (room && lvl) {
      const { w, d } = roomDims(room);
      const ceil = room.ceiling ?? lvl.height;
      const area = polyArea(room.poly);
      props_ = (
        <div data-testid="apron-props-room">
          <div className="nxV3PropKind">Room · {lvl.name}</div>
          <Field label="Name" value={room.label} testid="apron-room-name"
            onCommit={(v) => v.trim() && props.onPatchRoom(lvl.id, room.id, { label: v.trim() })} />
          <Field label="Type" value={room.roomType ?? ""} testid="apron-room-type"
            onCommit={(v) => props.onPatchRoom(lvl.id, room.id, { roomType: v.trim() || undefined })} />
          <Field label="Floor finish" value={room.finish ?? ""}
            onCommit={(v) => props.onPatchRoom(lvl.id, room.id, { finish: v.trim() || undefined })} />
          <Field label="Ceiling (m)" value={ceil} type="number" step={0.05} testid="apron-room-ceiling"
            onCommit={(v) => { const n = Number(v); if (n > 1 && n <= lvl.height + 1) props.onPatchRoom(lvl.id, room.id, { ceiling: n }); }} />
          <Row k="Area" v={formatArea(area, units)} testid="apron-room-area" />
          <Row k="Envelope" v={`${formatLen(w, units)} × ${formatLen(d, units)}`} />
          <Row k="Volume" v={units === "metric" ? `${(area * ceil).toFixed(1)} m³` : `${(area * ceil * 35.3147).toFixed(0)} ft³`} />
          <Row k="Perimeter" v={formatLen(room.poly.reduce((s, p, i) => {
            const q = room.poly[(i + 1) % room.poly.length];
            return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
          }, 0), units)} />
        </div>
      );
    }
  } else if (selection?.kind === "opening") {
    const lvl = fp.levels.find((l) => l.id === selection.level);
    const op = lvl && findOpening(lvl, selection.id);
    if (op && lvl) {
      const w = Math.hypot(op.edge[1][0] - op.edge[0][0], op.edge[1][1] - op.edge[0][1]);
      const wall = wallOfOpening(levelWalls(lvl), lvl, op.id);
      props_ = (
        <div data-testid="apron-props-opening">
          <div className="nxV3PropKind">{op.kind === "door" ? "Door" : "Window"} · {lvl.name}</div>
          <Field label="Width (m)" value={w.toFixed(2)} type="number" step={0.05} testid="apron-opening-width"
            onCommit={(v) => { const n = Number(v); if (n >= 0.4 && n <= 5) props.onResizeOpening(lvl.id, op.id, n); }} />
          {op.kind === "window" && (
            <>
              <Field label="Sill (m)" value={op.sill ?? 0.9} type="number" step={0.05}
                onCommit={(v) => { const n = Number(v); if (n >= 0 && n < lvl.height) props.onPatchOpening(lvl.id, op.id, { sill: n }); }} />
              <Field label="Head (m)" value={op.head ?? Math.min(2.2, lvl.height - 0.3)} type="number" step={0.05}
                onCommit={(v) => { const n = Number(v); if (n > (op.sill ?? 0.9) && n <= lvl.height) props.onPatchOpening(lvl.id, op.id, { head: n }); }} />
            </>
          )}
          {op.kind === "door" && (
            <>
              <Row k="Head" v={formatLen(2.05, units)} />
              <button type="button" className="nxV3Btn nxV3BtnBlock" data-testid="apron-door-swing"
                onClick={() => props.onPatchOpening(lvl.id, op.id, { swing: ((op.swing ?? 1) * -1) as 1 | -1 })}>
                Flip swing (now {op.swing === -1 ? "right" : "left"}-hand)
              </button>
            </>
          )}
          <Row k="Wall" v={wall ? `${wall.shared ? "Partition" : "External"} · ${formatLen(Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]), units)}` : "—"} />
        </div>
      );
    }
  } else if (selection?.kind === "wall") {
    const lvl = fp.levels.find((l) => l.id === selection.level);
    const wall = lvl && levelWalls(lvl).find((w) =>
      (Math.hypot(w.a[0] - selection.a[0], w.a[1] - selection.a[1]) < 1e-3 && Math.hypot(w.b[0] - selection.b[0], w.b[1] - selection.b[1]) < 1e-3)
      || (Math.hypot(w.a[0] - selection.b[0], w.a[1] - selection.b[1]) < 1e-3 && Math.hypot(w.b[0] - selection.a[0], w.b[1] - selection.a[1]) < 1e-3));
    if (wall && lvl) {
      const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      const rooms = lvl.rooms.filter((r) => wall.rooms.includes(r.id));
      const ops = openingsOnWall(wall, lvl.openings);
      props_ = (
        <div data-testid="apron-props-wall">
          <div className="nxV3PropKind">{wall.shared ? "Partition wall" : "External wall"} · {lvl.name}</div>
          <Row k="Length" v={formatLen(len, units)} testid="apron-wall-length" />
          <Row k="Thickness" v={formatLen(wall.shared ? Math.max(t * 0.6, 0.08) : t, units)} />
          <Row k="Height" v={formatLen(lvl.height, units)} />
          <Row k="Gross face" v={formatArea(len * lvl.height, units)} />
          <Row k="Construction" v={wall.shared ? "Stud partition (nominal)" : "Cavity external (nominal)"} />
          <Row k="Bounds" v={rooms.map((r) => r.label).join(" · ") || "—"} />
          <Row k="Openings" v={ops.length ? ops.map((o) => `${o.opening.kind} ${formatLen(Math.hypot(o.opening.edge[1][0] - o.opening.edge[0][0], o.opening.edge[1][1] - o.opening.edge[0][1]), units)}`).join(" · ") : "none"} />
          <p className="nxV3PropHint">Drag the wall in the plan to move it — dimensions, areas, the schedule and the 3D model follow.</p>
        </div>
      );
    }
  }
  if (!props_) {
    props_ = (
      <div data-testid="apron-props-none">
        <div className="nxV3PropKind">{level.name}</div>
        <Row k="Rooms" v={level.rooms.length} />
        <Row k="Internal area" v={formatArea(levelArea(level), units)} />
        <Row k="Wall height" v={formatLen(level.height, units)} />
        <Row k="Openings" v={`${(level.openings ?? []).filter((o) => o.kind === "door").length} doors · ${(level.openings ?? []).filter((o) => o.kind === "window").length} windows`} />
        <p className="nxV3PropHint">Select a room, wall, door or window in the plan to read and edit its specification.</p>
      </div>
    );
  }

  return (
    <aside className="nxV3Apron" data-testid="viewer3d-apron" aria-label="Technical panel">
      <div className="nxV3ApronHead">
        <span>Technical panel</span>
        <button type="button" className="nxV3CardClose" aria-label="Close panel" onClick={props.onClose}>×</button>
      </div>

      <details open className="nxV3ApronSec" data-testid="apron-sec-props">
        <summary>Properties</summary>
        {props_}
      </details>

      <details open className="nxV3ApronSec">
        <summary>Layers</summary>
        <div className="nxV3LayerGrid" data-testid="apron-layers">
          {([["dims", "Dimensions"], ["labels", "Room labels"], ["openings", "Openings"], ["hotspots", "Markers"]] as const).map(([k, lab]) => (
            <label key={k} className="nxV3Layer">
              <input type="checkbox" checked={layers[k] !== false} data-testid={`apron-layer-${k}`}
                onChange={(e) => props.onLayers({ [k]: e.target.checked })} />
              <span>{lab}</span>
            </label>
          ))}
        </div>
      </details>

      <details open className="nxV3ApronSec">
        <summary>Levels</summary>
        <div className="nxV3Tree" data-testid="apron-tree">
          {fp.levels.map((l) => (
            <div key={l.id}>
              <button type="button" className="nxV3TreeLevel" aria-pressed={l.id === activeLevel}
                data-testid={`apron-tree-${l.id}`}
                onClick={() => { props.onLevel(l.id); props.onSelect(null); }}>
                {l.name} <em>{formatArea(levelArea(l), units)}</em>
              </button>
              {l.id === activeLevel && l.rooms.map((r) => (
                <button key={r.id} type="button" className="nxV3TreeRoom"
                  aria-pressed={selection?.kind === "room" && selection.id === r.id}
                  data-testid={`apron-tree-room-${r.id}`}
                  onClick={() => props.onSelect({ kind: "room", level: l.id, id: r.id })}>
                  {r.label} <em>{formatArea(polyArea(r.poly), units)}</em>
                </button>
              ))}
            </div>
          ))}
        </div>
      </details>

      <details className="nxV3ApronSec" data-testid="apron-sec-sheet">
        <summary>Sheet</summary>
        <Field label="Project" value={meta.project ?? ""} testid="apron-sheet-project"
          onCommit={(v) => props.onPatchMeta({ project: v.trim() || undefined })} />
        <Field label="Address" value={meta.address ?? ""}
          onCommit={(v) => props.onPatchMeta({ address: v.trim() || undefined })} />
        <Field label="Client" value={meta.client ?? ""}
          onCommit={(v) => props.onPatchMeta({ client: v.trim() || undefined })} />
        <Field label="Drawn by" value={meta.drawnBy ?? ""}
          onCommit={(v) => props.onPatchMeta({ drawnBy: v.trim() || undefined })} />
        <Field label="Date" value={meta.date ?? ""}
          onCommit={(v) => props.onPatchMeta({ date: v.trim() || undefined })} />
        <Field label="Sheet" value={meta.sheet ?? "A-101"}
          onCommit={(v) => props.onPatchMeta({ sheet: v.trim() || undefined })} />
        <Field label="Revision" value={meta.revision ?? "A"}
          onCommit={(v) => props.onPatchMeta({ revision: v.trim() || undefined })} />
        <Field label="North (°)" value={meta.northDeg ?? 0} type="number" step={1} testid="apron-sheet-north"
          onCommit={(v) => { const n = Number(v); if (Number.isFinite(n)) props.onPatchMeta({ northDeg: ((n % 360) + 360) % 360 }); }} />
      </details>

      <details open className="nxV3ApronSec" data-testid="apron-sec-schedule">
        <summary>Room schedule</summary>
        <table className="nxV3SchedTable">
          <thead>
            <tr><th>Room</th><th>Area</th><th>Ceil.</th><th>Finish</th></tr>
          </thead>
          {fp.levels.map((l) => (
            <tbody key={l.id}>
              <tr className="nxV3SchedLevel"><td colSpan={4}>{l.name}</td></tr>
              {l.rooms.map((r) => (
                <tr key={r.id} data-testid={`schedule-row-${r.id}`}
                  className={selection?.kind === "room" && selection.id === r.id ? "nxV3SchedSel" : undefined}
                  onClick={() => { props.onLevel(l.id); props.onSelect({ kind: "room", level: l.id, id: r.id }); }}>
                  <td>{r.label}</td>
                  <td>{formatArea(polyArea(r.poly), units)}</td>
                  <td>{formatLen(r.ceiling ?? l.height, units)}</td>
                  <td>{r.finish ?? "—"}</td>
                </tr>
              ))}
              <tr className="nxV3SchedTotal">
                <td>Level total</td>
                <td data-testid={`schedule-total-${l.id}`}>{formatArea(levelArea(l), units)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          ))}
          <tbody>
            <tr className="nxV3SchedTotal nxV3SchedGrand">
              <td>Gross internal</td>
              <td data-testid="schedule-grand-total">{formatArea(fp.levels.reduce((s, l) => s + levelArea(l), 0), units)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </details>
    </aside>
  );
}

export default Apron;
