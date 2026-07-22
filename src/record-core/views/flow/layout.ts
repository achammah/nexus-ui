import { graphlib, layout as dagreLayout } from "@dagrejs/dagre";
import type { FlowGraphEdge, FlowGraphNode, XY } from "./graph";
import type { LayoutMode } from "./flowConfig";

/* Flow-view auto layouts — imported ONLY by the lazy FlowView chunk (dagre stays
   out of the eager bundle). Three switchable strategies behind one call:
   - "hierarchical": dagre TB for graphs up to DAGRE_MAX_NODES (measured on a dev
     machine: 67ms at 500 nodes, 394ms at 2,000; 4.6–8.5s at 10,000 — a
     main-thread stall); an O(V+E) BFS-rank grid above the cutoff (same top-down
     visual family, instantly).
   - "force": a dependency-free Fruchterman–Reingold spring-electrical simulation
     — organic clusters; capped at FORCE_MAX_NODES (above → grid).
   - "grid": a stable packed grid — every node on a lattice, order-preserving.
   Positions are TOP-LEFT corner coordinates (what xyflow nodes take with the
   default nodeOrigin); dagre's center output converts before returning. Every
   layout is deterministic (seeded from node order) so re-runs are stable. */

export const DAGRE_MAX_NODES = 2000;
export const FORCE_MAX_NODES = 600; // FR is O(n²)/iteration — keep it interactive
export const NODE_W = 220;
export const NODE_H = 64;
export const HUB_W = 168;
export const HUB_H = 36;

const dims = (n: FlowGraphNode) =>
  n.kind === "hub" ? { width: HUB_W, height: HUB_H } : { width: NODE_W, height: NODE_H };

/* dispatch on the requested mode, falling back by size so a huge graph never
   stalls the main thread on an O(n²) pass */
export const layoutGraph = (
  nodes: FlowGraphNode[],
  edges: FlowGraphEdge[],
  mode: LayoutMode = "hierarchical",
): Record<string, XY> => {
  if (mode === "grid") return gridLayout(nodes);
  if (mode === "force") return nodes.length <= FORCE_MAX_NODES ? forceLayout(nodes, edges) : gridLayout(nodes);
  return nodes.length <= DAGRE_MAX_NODES ? dagreTB(nodes, edges) : bfsGrid(nodes, edges);
};

/* compute→positions wiring adapted from xyflow examples/react Layouting (MIT) */
const dagreTB = (nodes: FlowGraphNode[], edges: FlowGraphEdge[]): Record<string, XY> => {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 56 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, dims(n));
  for (const e of edges) g.setEdge(e.source, e.target);
  dagreLayout(g);
  const out: Record<string, XY> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    const d = dims(n);
    out[n.id] = { x: p.x - d.width / 2, y: p.y - d.height / 2 };
  }
  return out;
};

/* ---------- grid ---------- */
/* a stable packed lattice: columns chosen to a rough golden-ratio aspect, nodes
   placed in declared order (record cards, then hubs). Deterministic, instant. */
export const gridLayout = (nodes: FlowGraphNode[]): Record<string, XY> => {
  const GAP_X = 40;
  const GAP_Y = 44;
  const cols = Math.max(1, Math.round(Math.sqrt(nodes.length * 1.7)));
  const out: Record<string, XY> = {};
  nodes.forEach((n, i) => {
    out[n.id] = { x: (i % cols) * (NODE_W + GAP_X), y: Math.floor(i / cols) * (NODE_H + GAP_Y) };
  });
  return out;
};

/* ---------- force (Fruchterman–Reingold) ---------- */
/* a small deterministic PRNG (mulberry32) seeded from the node count keeps the
   initial spiral placement — and thus the settled layout — stable across renders */
const seededSpiral = (nodes: FlowGraphNode[]): Map<string, { x: number; y: number }> => {
  const pos = new Map<string, { x: number; y: number }>();
  const golden = Math.PI * (3 - Math.sqrt(5)); // phyllotaxis angle — even spread
  const step = Math.max(NODE_W, NODE_H) * 0.9;
  nodes.forEach((n, i) => {
    const r = step * Math.sqrt(i + 0.5);
    const a = i * golden;
    pos.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a) });
  });
  return pos;
};

export const forceLayout = (nodes: FlowGraphNode[], edges: FlowGraphEdge[]): Record<string, XY> => {
  const n = nodes.length;
  if (n === 0) return {};
  if (n === 1) return { [nodes[0].id]: { x: 0, y: 0 } };
  const pos = seededSpiral(nodes);
  const ids = nodes.map((nd) => nd.id);
  const idSet = new Set(ids);
  const links = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));

  // ideal edge length scaled to node size so cards don't overlap when settled
  const k = Math.max(NODE_W, NODE_H) * 1.35;
  const area = k * k * n;
  const iterations = Math.min(400, 220 + n * 3);
  let temp = Math.sqrt(area) / 8; // initial max displacement per step
  const cool = temp / (iterations + 1);

  const disp = new Map<string, { x: number; y: number }>();
  for (let it = 0; it < iterations; it++) {
    for (const id of ids) disp.set(id, { x: 0, y: 0 });
    // repulsion — every pair pushes apart (fr = k²/d)
    for (let i = 0; i < n; i++) {
      const a = pos.get(ids[i])!;
      for (let j = i + 1; j < n; j++) {
        const b = pos.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (i - j) * 0.01 + 0.01; dy = 0.01; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        const da = disp.get(ids[i])!;
        const db = disp.get(ids[j])!;
        da.x += ux; da.y += uy;
        db.x -= ux; db.y -= uy;
      }
    }
    // attraction — edges pull endpoints together (fa = d²/k)
    for (const e of links) {
      const a = pos.get(e.source)!;
      const b = pos.get(e.target)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d * d) / k;
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      const da = disp.get(e.source)!;
      const db = disp.get(e.target)!;
      da.x -= ux; da.y -= uy;
      db.x += ux; db.y += uy;
    }
    // integrate, capped by temperature (cooling schedule)
    for (const id of ids) {
      const dp = disp.get(id)!;
      const len = Math.sqrt(dp.x * dp.x + dp.y * dp.y) || 0.01;
      const p = pos.get(id)!;
      p.x += (dp.x / len) * Math.min(len, temp);
      p.y += (dp.y / len) * Math.min(len, temp);
    }
    temp = Math.max(0, temp - cool);
  }

  // normalise to a top-left origin (xyflow node coords are top-left corners)
  let minX = Infinity;
  let minY = Infinity;
  for (const id of ids) {
    const p = pos.get(id)!;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  const out: Record<string, XY> = {};
  for (const id of ids) {
    const p = pos.get(id)!;
    out[id] = { x: p.x - minX, y: p.y - minY };
  }
  return out;
};

/* BFS ranks from the in-degree-0 roots; cycles seed from the first unvisited
   connected node; edge-less islands land in the band after the last rank */
export const bfsGrid = (nodes: FlowGraphNode[], edges: FlowGraphEdge[]): Record<string, XY> => {
  const GAP_X = 44;
  const GAP_Y = 52;
  const WRAP = 40; // columns per rank row before wrapping
  const out: Record<string, XY> = {};
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source).add(e.target);
    (outgoing.get(e.source) ?? outgoing.set(e.source, []).get(e.source)!).push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if (connected.has(n.id) && !indegree.get(n.id)) {
      rank.set(n.id, 0);
      queue.push(n.id);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    for (const next of outgoing.get(id) ?? []) {
      if (!rank.has(next)) {
        rank.set(next, (rank.get(id) ?? 0) + 1);
        queue.push(next);
      }
    }
  }
  for (const n of nodes) {
    // cycle remnant: unvisited but connected — seed a fresh BFS at rank 0
    if (connected.has(n.id) && !rank.has(n.id)) {
      rank.set(n.id, 0);
      const sub = [n.id];
      for (let qi = 0; qi < sub.length; qi++) {
        for (const next of outgoing.get(sub[qi]) ?? []) {
          if (!rank.has(next)) {
            rank.set(next, (rank.get(sub[qi]) ?? 0) + 1);
            sub.push(next);
          }
        }
      }
    }
  }
  const maxRank = Math.max(-1, ...rank.values());
  const byRank = new Map<number, FlowGraphNode[]>();
  for (const n of nodes) {
    const r = connected.has(n.id) ? (rank.get(n.id) ?? 0) : maxRank + 1; // islands band last
    (byRank.get(r) ?? byRank.set(r, []).get(r)!).push(n);
  }
  let y = 0;
  for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
    const band = byRank.get(r)!;
    const bandRows = Math.ceil(band.length / WRAP);
    band.forEach((n, i) => {
      out[n.id] = { x: (i % WRAP) * (NODE_W + GAP_X), y: y + Math.floor(i / WRAP) * (NODE_H + GAP_Y) };
    });
    y += bandRows * (NODE_H + GAP_Y) + GAP_Y;
  }
  return out;
};
