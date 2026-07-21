import { graphlib, layout as dagreLayout } from "@dagrejs/dagre";
import type { FlowGraphEdge, FlowGraphNode, XY } from "./graph";

/* Flow-view auto layout — imported ONLY by the lazy FlowView chunk (dagre stays
   out of the eager bundle). Two strategies behind one call:
   - dagre TB for graphs up to DAGRE_MAX_NODES (measured on a dev machine:
     67ms at 500 nodes, 394ms at 2,000; 4.6–8.5s at 10,000 — a main-thread stall);
   - an O(V+E) BFS-rank grid above the cutoff: rank = depth from the roots,
     rows wrap, islands band below — the same top-down visual family, instantly.
   Positions are TOP-LEFT corner coordinates (what xyflow nodes take with the
   default nodeOrigin); dagre's center output converts before returning. */

export const DAGRE_MAX_NODES = 2000;
export const NODE_W = 220;
export const NODE_H = 64;
export const HUB_W = 168;
export const HUB_H = 36;

const dims = (n: FlowGraphNode) =>
  n.kind === "hub" ? { width: HUB_W, height: HUB_H } : { width: NODE_W, height: NODE_H };

export const layoutGraph = (nodes: FlowGraphNode[], edges: FlowGraphEdge[]): Record<string, XY> =>
  nodes.length <= DAGRE_MAX_NODES ? dagreTB(nodes, edges) : bfsGrid(nodes, edges);

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
