// layout wiring shape adapted from xyflow/xyflow examples/react Layouting (MIT)
import * as React from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./flow.css";
import { Crosshair, Network, Search, SquarePlus, X } from "lucide-react";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { ViewProps } from "../types";
import type { FieldDef, RecordRow } from "../../types";
import {
  buildGraph,
  cardMetaFields,
  groupValueOf,
  positionsFor,
  positionsPatch,
  resolveLabelField,
  resolveRelation,
  secondarySelfEdges,
  sizesFor,
  sizesPatch,
  UNGROUPED,
  type FlowGraphEdge,
  type XY,
} from "./graph";
import { HUB_H, HUB_W, layoutGraph, NODE_H, NODE_W } from "./layout";
import {
  ALL_LAYOUTS,
  configAnimated,
  configEdgeDraw,
  configHandEdit,
  configNodeDetail,
  edgeTypeFor,
  enabledLayouts,
  isGrouped,
  LAYOUT_LABELS,
  resolveColorField,
  resolveDetailFields,
  resolveGroupField,
  resolveLayout,
  resolveShapeField,
  shapeForValue,
  type LayoutMode,
} from "./flowConfig";
import {
  FlowActionsContext,
  GroupNodeData,
  HubNodeData,
  inlineTitleType,
  nodeAccent,
  nodeTitle,
  RecordNodeData,
  nodeTypes,
  type FlowActions,
  type FlowNode,
} from "./nodes";
import { optionMeta } from "../../options";
import FlowContextMenu, { type FlowMenuState } from "./FlowContextMenu";
import FlowControls from "./FlowControls";
import NodeDetailPanel from "./NodeDetailPanel";

/* FlowView — an object's records as a full-fidelity node graph. Builds ON the v1
   (records as cards, one relation as edges, drag-persist, pan/zoom/minimap) and
   adds the confirmed depth: switchable layouts (hierarchy/force/grid), inline
   rename + resize, per-field node shapes + colors, subflow grouping with
   collapse, search-and-focus, fit-to-selection, hand-create + drag-to-relate,
   animated edges, and a rich node-detail panel — every capability config-declared
   with a sensible default. Loaded as a React.lazy chunk; the eager registry entry
   (definition.tsx) imports only the pure helpers. */

/* the group-layout geometry: box padding, header, inter-node + inter-group gaps */
const PAD = 18;
const HEADER_H = 40;
const GAP = 22;
const GROUP_GAP = 44;
const GROUPS_PER_ROW_MAXW = 1500; // wrap group boxes past this cursor width

type GroupBucket = { value: string; label: string; color?: string; rows: RecordRow[] };

/* order + label the group buckets: a select field keeps its declared option order
   + colors; the ungrouped bucket lands last */
function bucketize(rows: RecordRow[], field: FieldDef): GroupBucket[] {
  const byVal = new Map<string, RecordRow[]>();
  for (const r of rows) {
    const v = groupValueOf(r, field);
    (byVal.get(v) ?? byVal.set(v, []).get(v)!).push(r);
  }
  const order = (field.options ?? []).map((o) => (typeof o === "string" ? o : o.value));
  const seen = new Set<string>();
  const buckets: GroupBucket[] = [];
  const pushBucket = (v: string) => {
    if (v === UNGROUPED || seen.has(v) || !byVal.has(v)) return;
    seen.add(v);
    const meta = optionMeta(field, v);
    buckets.push({ value: v, label: meta.label || v, color: meta.color ? `var(--nx-opt-${meta.color})` : undefined, rows: byVal.get(v)! });
  };
  order.forEach(pushBucket);
  [...byVal.keys()].forEach(pushBucket); // any values not in the option list
  if (byVal.has(UNGROUPED)) buckets.push({ value: UNGROUPED, label: "Ungrouped", rows: byVal.get(UNGROUPED)! });
  return buckets;
}

export default function FlowView(props: ViewProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}

function FlowCanvas({ object, rows, readOnly, viewConfig, viewState, onViewState, onOpen, onPatch, onCreateDraft, onCreate, onDelete }: ViewProps) {
  const { fitView, setCenter, getNode, screenToFlowPosition } = useReactFlow();
  const isMobile = useIsMobile();
  // the canvas pane's REAL pixel size (0 until it mounts + lays out — the flow
  // view often mounts below the fold on mobile, so a fit fired too early runs
  // against a 0-size viewport and lands the graph in a garbage strip)
  const paneW = useStore((s) => s.width);
  const paneH = useStore((s) => s.height);
  // mobile clamps the fit to a LEGIBLE zoom (cards stay readable, pan to explore)
  // rather than shrinking 30+ nodes to unreadable slivers
  const fitOpts = React.useMemo(
    () => (isMobile ? { padding: 0.08, minZoom: 0.55, maxZoom: 1 } : { padding: 0.16, maxZoom: 1.4 }),
    [isMobile],
  );

  /* ---- resolve config ---- */
  const relationKey = resolveRelation(object, viewConfig, viewState);
  const labelField = resolveLabelField(object, viewConfig);
  const metaFields = React.useMemo(() => cardMetaFields(object, relationKey), [object, relationKey]);
  const colorField = React.useMemo(() => resolveColorField(object, viewConfig), [object, viewConfig]);
  const shapeField = React.useMemo(() => resolveShapeField(object, viewConfig), [object, viewConfig]);
  const groupField = React.useMemo(() => resolveGroupField(object, viewConfig), [object, viewConfig]);
  const detailFields = React.useMemo(() => resolveDetailFields(object, viewConfig), [object, viewConfig]);
  const enabled = React.useMemo(() => enabledLayouts(viewConfig), [viewConfig]);
  const layoutMode = resolveLayout(viewConfig, viewState, enabled);
  const edgeType = edgeTypeFor(viewConfig, layoutMode);
  const animated = configAnimated(viewConfig);
  const handEdit = configHandEdit(viewConfig) && !readOnly;
  const detailOn = configNodeDetail(viewConfig);
  const grouped = !!groupField && isGrouped(object, viewConfig, viewState);
  const edgeLabelsOn = viewConfig.edgeLabels === true;

  const activeField = object.fields.find((f) => f.key === relationKey);
  const selfRelation = !!activeField && (activeField.relation === object.key);
  const connectable = configEdgeDraw(viewConfig) && !readOnly && selfRelation;

  /* layout lock (the zoom cluster's toggle): pan/zoom/open stay live, moving
     nodes + drawing edges pause — rendered only when it governs something */
  const [locked, setLocked] = React.useState(false);
  const lockable = (!readOnly && !grouped) || connectable;

  const secondaryKey = typeof viewConfig.secondaryRelationField === "string" ? viewConfig.secondaryRelationField : "";
  // skip the overlay when it names the ACTIVE relation (else the same links draw twice)
  const secondaryField =
    secondaryKey && secondaryKey !== relationKey
      ? object.fields.find((f) => f.key === secondaryKey && f.type === "relation" && f.relation === object.key)
      : undefined;

  /* ---- graph derivation ---- */
  const graph = React.useMemo(() => buildGraph(object, rows, relationKey), [object, rows, relationKey]);
  const nodeIds = React.useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph]);
  const graphEdges = React.useMemo<FlowGraphEdge[]>(() => {
    if (!secondaryField) return graph.edges;
    return [...graph.edges, ...secondarySelfEdges(object, rows, secondaryField.key, nodeIds)];
  }, [graph, secondaryField, object, rows, nodeIds]);

  /* ---- persistence (memoized: an inline call returns a fresh {} when the key is
     absent, which would thrash the node memo into an infinite setNodes loop) ---- */
  const persisted = React.useMemo(() => positionsFor(viewState, relationKey), [viewState.flowPos, relationKey]);
  const persistedSizes = React.useMemo(() => sizesFor(viewState, relationKey), [viewState.flowSizes, relationKey]);
  const collapsed = React.useMemo(() => {
    const c = viewState.flowCollapsed as Record<string, boolean> | undefined;
    return c && typeof c === "object" ? c : {};
  }, [viewState.flowCollapsed]);

  /* ---- auto layout (flat mode) ---- */
  const structureKey = React.useMemo(
    () => graph.nodes.map((n) => n.id).join("|") + "#" + graphEdges.map((e) => e.id).join("|"),
    [graph, graphEdges],
  );
  const flatLayout = React.useMemo(
    () => (grouped ? {} : layoutGraph(graph.nodes, graph.edges, layoutMode)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey, layoutMode, grouped],
  );

  /* ---- search ---- */
  const [query, setQuery] = React.useState("");
  const matchIds = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set<string>();
    for (const n of graph.nodes) {
      const label = n.kind === "record" ? nodeTitle({ row: n.row, labelField, metaFields, i: 0, shape: "rounded" }) : n.label;
      if (label.toLowerCase().includes(q)) ids.add(n.id);
    }
    return ids;
  }, [query, graph, labelField, metaFields]);

  /* ---- build xyflow nodes ---- */
  const rfNodes = React.useMemo<FlowNode[]>(() => {
    const shapeOf = (row: RecordRow) => (shapeField ? shapeForValue(shapeField, row[shapeField.key]) : "rounded");
    const cls = (id: string) => (matchIds ? (matchIds.has(id) ? "nxMatch" : "nxDim") : undefined);

    if (grouped && groupField) {
      const buckets = bucketize(rows, groupField);
      const out: FlowNode[] = [];
      let cx = 0;
      let cy = 0;
      let rowMaxH = 0;
      buckets.forEach((b, bi) => {
        const isCollapsed = !!collapsed[b.value];
        const cols = Math.max(1, Math.ceil(Math.sqrt(b.rows.length)));
        const bodyRows = Math.ceil(b.rows.length / cols);
        const boxW = isCollapsed ? 260 : PAD * 2 + cols * NODE_W + (cols - 1) * GAP;
        const boxH = isCollapsed ? HEADER_H + 8 : HEADER_H + PAD + bodyRows * NODE_H + (bodyRows - 1) * GAP + PAD;
        if (cx > 0 && cx + boxW > GROUPS_PER_ROW_MAXW) { cx = 0; cy += rowMaxH + GROUP_GAP; rowMaxH = 0; }
        const groupId = `group:${b.value}`;
        out.push({
          id: groupId,
          type: "group",
          position: { x: cx, y: cy },
          width: boxW,
          height: boxH,
          draggable: false,
          selectable: false,
          data: { label: b.label, count: b.rows.length, color: b.color, collapsed: isCollapsed, value: b.value } as GroupNodeData,
        });
        if (!isCollapsed) {
          b.rows.forEach((row, i) => {
            const id = String(row.id);
            const col = i % cols;
            const rr = Math.floor(i / cols);
            out.push({
              id,
              type: "record",
              parentId: groupId,
              extent: "parent",
              position: { x: PAD + col * (NODE_W + GAP), y: HEADER_H + PAD + rr * (NODE_H + GAP) },
              width: NODE_W,
              height: NODE_H,
              className: cls(id),
              ariaLabel: nodeTitle({ row, labelField, metaFields, i, shape: "rounded" }),
              data: { row, labelField, metaFields, i: Math.min(i + bi, 11), shape: shapeOf(row) } as RecordNodeData,
            });
          });
        }
        cx += boxW + GROUP_GAP;
        rowMaxH = Math.max(rowMaxH, boxH);
      });
      return out;
    }

    // flat mode
    return graph.nodes.map((n, idx) => {
      const i = Math.min(idx, 11);
      const position: XY = persisted[n.id] ?? flatLayout[n.id] ?? { x: 0, y: 0 };
      if (n.kind === "record") {
        const sz = persistedSizes[n.id];
        return {
          id: n.id,
          type: "record" as const,
          position,
          width: sz?.width ?? NODE_W,
          height: sz?.height ?? NODE_H,
          className: cls(n.id),
          ariaLabel: nodeTitle({ row: n.row, labelField, metaFields, i, shape: "rounded" }),
          data: { row: n.row, labelField, metaFields, i, shape: shapeOf(n.row) } as RecordNodeData,
        };
      }
      return {
        id: n.id,
        type: "hub" as const,
        position,
        width: HUB_W,
        height: HUB_H,
        className: cls(n.id),
        ariaLabel: n.label,
        data: { label: n.label, count: n.count, i } as HubNodeData,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, flatLayout, grouped, groupField, collapsed, rows, matchIds, shapeField, persistedSizes, persisted, relationKey, labelField, metaFields]);

  /* ---- build xyflow edges ---- */
  const rfEdges = React.useMemo<Edge[]>(() => {
    // in grouped+collapsed mode, drop edges whose endpoints are hidden
    const visible = new Set(rfNodes.filter((n) => n.type === "record").map((n) => n.id));
    return graphEdges
      .filter((e) => !grouped || (visible.has(e.source) && visible.has(e.target)))
      .map((e) => {
        const secondary = e.kind === "secondary";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: edgeType,
          animated,
          label: edgeLabelsOn ? e.label : undefined,
          className: secondary ? "nxEdgeSecondary" : "nxEdgePrimary",
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
          data: { kind: e.kind },
        } as Edge;
      });
  }, [graphEdges, rfNodes, grouped, edgeType, animated, edgeLabelsOn]);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(rfEdges);
  React.useEffect(() => setNodes(rfNodes), [rfNodes, setNodes]);
  React.useEffect(() => setEdges(rfEdges), [rfEdges, setEdges]);

  /* re-fit when the STRUCTURE, layout mode, grouping, or relation changes */
  const fitKey = `${structureKey}~${layoutMode}~${grouped}~${relationKey}`;
  const firstFit = React.useRef(true);
  const [animating, setAnimating] = React.useState(false);
  React.useEffect(() => {
    if (firstFit.current) { firstFit.current = false; return; }
    setAnimating(true);
    const t = window.setTimeout(() => fitView({ duration: 400, ...fitOpts }), 30);
    const t2 = window.setTimeout(() => setAnimating(false), 480);
    return () => { window.clearTimeout(t); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  /* mobile initial view: 32 nodes at fit-all are unreadable slivers, so frame the
     ROOT + its first reports at a legible zoom (cards readable, FILLING the pane,
     pannable). Fired ONLY once the pane reports a real (non-zero) pixel size — a
     fit against the 0-size below-the-fold mount lands the graph in a dead strip. */
  const mobileFitKey = React.useRef("");
  React.useEffect(() => {
    if (!isMobile || grouped) { mobileFitKey.current = ""; return; }
    if (paneW < 80 || paneH < 120) return; // wait for a real canvas
    const root = graph.nodes.find((n) => n.kind === "record");
    if (!root) return;
    const key = `${structureKey}~${Math.round(paneW)}x${Math.round(paneH)}`;
    if (mobileFitKey.current === key) return;
    mobileFitKey.current = key;
    // place the ROOT near the TOP of the pane at a legible fixed zoom, so the org
    // fills DOWNWARD from the CEO (cards readable, pannable) — centring the root
    // instead would leave the whole top half empty (nothing is above the root)
    const t = window.setTimeout(() => {
      const rn = getNode(root.id);
      const zoom = 0.72;
      if (!rn) { fitView({ nodes: [{ id: root.id }], padding: 1.0, minZoom: 0.5, maxZoom: 0.85, duration: 300 }); return; }
      const rx = rn.position.x + (rn.measured?.width ?? NODE_W) / 2;
      const ry = rn.position.y + (rn.measured?.height ?? NODE_H) / 2;
      // land the root ~130px below the pane top — clear of the on-canvas toolbar
      // overlay — so the org fills downward and nothing hides under the toolbar
      setCenter(rx, ry + (paneH / 2 - 130) / zoom, { zoom, duration: 300 });
    }, 40);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, grouped, paneW, paneH, structureKey]);

  /* ---- handlers ---- */
  const [announced, setAnnounced] = React.useState("");
  const onNodeDragStop = React.useCallback<OnNodeDrag<FlowNode>>(
    (_e, node, dragged) => {
      if (grouped) return; // grouped positions are derived, not persisted
      const movedNodes = dragged?.length ? dragged : [node];
      const moved: Record<string, XY> = {};
      for (const n of movedNodes) if (n.type !== "group") moved[n.id] = { x: n.position.x, y: n.position.y };
      onViewState(positionsPatch(viewState, relationKey, moved));
      const label = node.type === "record" ? nodeTitle(node.data as RecordNodeData) : String((node.data as HubNodeData).label ?? "");
      setAnnounced(`${label} moved`);
    },
    [onViewState, viewState, relationKey, grouped],
  );

  /* drag-between-records-to-create-a-relation: writing the target row's relation
     field to include the source (source ranks as parent, matching buildGraph) */
  const onConnect = React.useCallback(
    (c: Connection) => {
      if (!connectable || !onPatch || !activeField || !c.source || !c.target || c.source === c.target) return;
      const child = c.target;
      const parent = c.source;
      const childRow = rows.find((r) => String(r.id) === child);
      if (!childRow) return;
      const existing = childRow._refs && (childRow._refs as Record<string, unknown>)[relationKey];
      const cur = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
      if (cur.includes(parent)) return; // already linked
      const next = activeField.multiple ? [...cur, parent] : parent;
      onPatch(child, { [relationKey]: next });
      setAnnounced(`Linked ${nodeTitle({ row: childRow, labelField, metaFields, i: 0, shape: "rounded" })}`);
    },
    [connectable, onPatch, activeField, rows, relationKey, labelField, metaFields],
  );

  const onResize = React.useCallback(
    (id: string, width: number, height: number) => {
      onViewState(sizesPatch(viewState, relationKey, { [id]: { width, height } }));
    },
    [onViewState, viewState, relationKey],
  );

  const onCommitTitle = React.useCallback(
    (id: string, key: string, value: string) => {
      if (onPatch) onPatch(id, { [key]: value });
    },
    [onPatch],
  );

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const detailRow = detailId ? rows.find((r) => String(r.id) === detailId) : undefined;
  // the detail target vanished (deleted / filtered out) → close
  React.useEffect(() => {
    if (detailId && !detailRow) setDetailId(null);
  }, [detailId, detailRow]);

  const openTarget = React.useCallback(
    (id: string) => {
      const isRecord = graph.nodes.some((n) => n.kind === "record" && n.id === id);
      if (!isRecord) return; // hubs are another object's records
      if (detailOn) setDetailId(id);
      else onOpen(id);
    },
    [graph, detailOn, onOpen],
  );

  // graph-native relation link: recenter on a related record + open its detail
  const jumpTo = React.useCallback(
    (id: string) => {
      if (!graph.nodes.some((n) => n.kind === "record" && n.id === id)) return;
      setDetailId(id);
      fitView({ nodes: [{ id }], duration: 400, padding: 0.5, maxZoom: isMobile ? 1.2 : 1.4 });
    },
    [graph, fitView, isMobile],
  );

  const onToggleGroup = React.useCallback(
    (value: string) => {
      const cur = (viewState.flowCollapsed as Record<string, boolean>) ?? {};
      onViewState({ flowCollapsed: { ...cur, [value]: !cur[value] } });
    },
    [onViewState, viewState],
  );

  const setLayout = React.useCallback((m: LayoutMode) => onViewState({ flowLayout: m }), [onViewState]);
  const toggleGrouping = React.useCallback(
    () => onViewState({ flowGrouped: !grouped }),
    [onViewState, grouped],
  );

  const fitSelection = React.useCallback(() => {
    const sel = nodes.filter((n) => n.selected && n.type !== "group");
    if (sel.length) fitView({ nodes: sel.map((n) => ({ id: n.id })), duration: 400, padding: 0.3, maxZoom: isMobile ? 1.2 : 1.5 });
    else fitView({ duration: 400, ...fitOpts });
  }, [nodes, fitView]);

  const runSearch = React.useCallback(() => {
    if (!matchIds || matchIds.size === 0) return;
    fitView({ nodes: [...matchIds].map((id) => ({ id })), duration: 400, padding: 0.4, maxZoom: 1.4 });
  }, [matchIds, fitView]);

  const addNode = React.useCallback(() => {
    const prefill: Record<string, unknown> = { [labelField.key]: `New ${object.labelOne}` };
    if (onCreateDraft) onCreateDraft(prefill);
    else if (onCreate) void onCreate(prefill);
  }, [onCreateDraft, onCreate, labelField, object]);

  /* ---- right-click editor menu (canvas add-typed-node · node edit actions) ---- */
  const typeField = shapeField ?? colorField; // the select field that DEFINES a node's "type"
  const [menu, setMenu] = React.useState<FlowMenuState>(null);
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const [renameRequest, setRenameRequest] = React.useState<string | null>(null);
  const onRenameHandled = React.useCallback(() => setRenameRequest(null), []);

  /* persist a created node's position so its card centers on the cursor —
     the same viewState path node-drag persists through (flat mode only:
     grouped positions are derived) */
  const persistPosAt = React.useCallback(
    (id: string, at: { x: number; y: number }) => {
      if (grouped) return;
      const p = screenToFlowPosition(at);
      onViewState(positionsPatch(viewState, relationKey, { [id]: { x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - NODE_H / 2) } }));
    },
    [grouped, screenToFlowPosition, onViewState, viewState, relationKey],
  );

  const menuAdd = React.useCallback(
    async (at: { x: number; y: number }, type?: string) => {
      const prefill: Record<string, unknown> = { [labelField.key]: `New ${type ?? object.labelOne}` };
      if (type && typeField) prefill[typeField.key] = type;
      if (onCreateDraft) { onCreateDraft(prefill); return; } // record-view draft path (addNode's preference)
      if (!onCreate) return;
      const row = await onCreate(prefill);
      if (row && row.id != null) {
        persistPosAt(String(row.id), at);
        setAnnounced(`${String(prefill[labelField.key])} added`);
      }
    },
    [labelField, object, typeField, onCreateDraft, onCreate, persistPosAt],
  );

  const menuChangeType = React.useCallback(
    (id: string, value: string) => {
      if (!typeField || !onPatch) return;
      onPatch(id, { [typeField.key]: value });
      setAnnounced(`${typeField.label} set to ${value}`);
    },
    [typeField, onPatch],
  );

  const menuDuplicate = React.useCallback(
    async (id: string) => {
      const row = rows.find((r) => String(r.id) === id);
      if (!row) return;
      const body: Record<string, unknown> = {};
      for (const f of object.fields) {
        if (f.isActive === false) continue;
        if (f.type === "relation") {
          const refs = row._refs && (row._refs as Record<string, unknown>)[f.key];
          if (refs !== undefined) body[f.key] = refs;
        } else if (row[f.key] !== undefined) body[f.key] = row[f.key];
      }
      body[labelField.key] = `${nodeTitle({ row, labelField, metaFields, i: 0, shape: "rounded" })} copy`;
      if (!onCreate) { onCreateDraft?.(body); return; } // draft-prefilled duplicate on the record view
      const created = await onCreate(body);
      if (created && created.id != null && !grouped) {
        const src = persisted[id] ?? flatLayout[id];
        if (src) onViewState(positionsPatch(viewState, relationKey, { [String(created.id)]: { x: src.x + 28, y: src.y + 28 } }));
      }
      setAnnounced(`${String(body[labelField.key])} created`);
    },
    [rows, object, labelField, metaFields, onCreate, onCreateDraft, grouped, persisted, flatLayout, onViewState, viewState, relationKey],
  );

  /* create a node pre-linked to the right-clicked one (self-relation graphs):
     the child ranks under the parent exactly as a drawn edge would */
  const menuAddConnected = React.useCallback(
    async (parentId: string, at: { x: number; y: number }) => {
      if (!onCreate || !onPatch || !activeField) return;
      const prefill: Record<string, unknown> = { [labelField.key]: `New ${object.labelOne}` };
      const parent = rows.find((r) => String(r.id) === parentId);
      if (typeField && parent && parent[typeField.key] !== undefined) prefill[typeField.key] = parent[typeField.key];
      const row = await onCreate(prefill);
      if (!row || row.id == null) return;
      onPatch(String(row.id), { [relationKey]: activeField.multiple ? [parentId] : parentId });
      if (!grouped) {
        const src = persisted[parentId] ?? flatLayout[parentId];
        if (src) onViewState(positionsPatch(viewState, relationKey, { [String(row.id)]: { x: src.x, y: src.y + NODE_H + 64 } }));
        else persistPosAt(String(row.id), at);
      }
      setAnnounced("Connected node added");
    },
    [onCreate, onPatch, activeField, labelField, object, rows, typeField, relationKey, grouped, persisted, flatLayout, onViewState, viewState, persistPosAt],
  );

  const menuDelete = React.useCallback(
    (id: string) => {
      if (!onDelete) return;
      onDelete(id);
      setAnnounced("Deleted");
    },
    [onDelete],
  );

  const actions = React.useMemo<FlowActions>(
    () => ({ editable: handEdit, connectable, colorField, onCommitTitle, onResize, onOpenDetail: openTarget, onToggleGroup, renameRequest, onRenameHandled }),
    [handEdit, connectable, colorField, onCommitTitle, onResize, openTarget, onToggleGroup, renameRequest, onRenameHandled],
  );

  /* keyboard: Enter/Space on a focused node opens it; arrows move focus to the
     nearest node in that direction (one tab-stop per node from xyflow) */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
    const focused = el?.closest?.(".react-flow__node") as HTMLElement | null;
    if ((e.key === "Enter" || e.key === " ") && focused) {
      const id = focused.getAttribute("data-id");
      if (id) { e.preventDefault(); openTarget(id); }
      return;
    }
    if (focused && e.key.startsWith("Arrow")) {
      const id = focused.getAttribute("data-id");
      const from = nodes.find((n) => n.id === id);
      if (!from) return;
      const dir = e.key;
      let best: { id: string; d: number } | null = null;
      for (const n of nodes) {
        if (n.id === id || n.type === "group") continue;
        const dx = n.position.x - from.position.x;
        const dy = n.position.y - from.position.y;
        const ok = dir === "ArrowRight" ? dx > 12 : dir === "ArrowLeft" ? dx < -12 : dir === "ArrowDown" ? dy > 12 : dy < -12;
        if (!ok) continue;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { id: n.id, d };
      }
      if (best) {
        e.preventDefault();
        const target = document.querySelector(`.react-flow__node[data-id="${best.id}"]`) as HTMLElement | null;
        target?.focus();
      }
    }
  };

  if (rows.length === 0) {
    return (
      <div className="nxCard nxFlowEmpty nx-rise-in" data-testid="flow-empty">
        <Network size={22} />
        <b>Nothing to map yet</b>
        <span>{object.label} appear here as a graph — records as cards, linked records connected by edges.</span>
      </div>
    );
  }

  const canAdd = handEdit && (!!onCreateDraft || !!onCreate);

  return (
    <div
      className={`nxFlowWrap nx-rise-in${animating ? " nxFlowAnimating" : ""}${detailRow ? " nxFlowHasDetail" : ""}`}
      data-testid={`flow-${object.key}`}
      data-layout={layoutMode}
      data-connectable={connectable ? "1" : "0"}
      data-touch={isMobile ? "1" : "0"}
      role="region"
      aria-label={`${object.label} flow graph`}
      onKeyDown={onKeyDown}
    >
      <FlowActionsContext.Provider value={actions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => node.type !== "group" && openTarget(node.id)}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={!readOnly && !grouped && !locked}
          nodesConnectable={connectable && !locked}
          elementsSelectable
          selectNodesOnDrag={false}
          multiSelectionKeyCode="Shift"
          edgesFocusable={false}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          nodeDragThreshold={6}
          fitView
          fitViewOptions={fitOpts}
          minZoom={0.05}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          defaultMarkerColor={null as unknown as string}
          onPaneContextMenu={(e) => {
            if (!handEdit || !canAdd) return; // read-only canvas keeps the browser menu
            e.preventDefault();
            setMenu({ kind: "pane", x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY });
          }}
          onNodeContextMenu={(e, node) => {
            if (!handEdit || node.type !== "record") return;
            e.preventDefault();
            const row = rows.find((r) => String(r.id) === node.id);
            setMenu({
              kind: "node",
              x: e.clientX,
              y: e.clientY,
              nodeId: node.id,
              nodeTitle: nodeTitle(node.data as RecordNodeData),
              typeValue: typeField && row ? String(row[typeField.key] ?? "") : undefined,
            });
          }}
          onMoveStart={() => setMenu(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />

          {/* on-canvas control cluster — layout switcher + grouping + search */}
          <Panel position="top-left">
            <div className="nxFlowToolbar" data-testid="flow-toolbar">
              {enabled.length > 1 && (
                <div className="nxSeg nxFlowLayoutSeg" role="group" aria-label="Layout">
                  {ALL_LAYOUTS.filter((m) => enabled.includes(m)).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="nxSegBtn"
                      data-active={layoutMode === m}
                      data-testid={`flow-layout-${m}`}
                      onClick={() => setLayout(m)}
                    >
                      {LAYOUT_LABELS[m]}
                    </button>
                  ))}
                </div>
              )}
              {groupField && (
                <button
                  type="button"
                  className="nxFlowChipBtn"
                  data-active={grouped}
                  data-testid="flow-group-toggle"
                  onClick={toggleGrouping}
                  title={`Group by ${groupField.label}`}
                >
                  Group: {groupField.label}
                </button>
              )}
              <div className="nxFlowSearch">
                <Search size={13} aria-hidden />
                <input
                  className="nxFlowSearchInput"
                  data-testid="flow-search"
                  placeholder="Find node…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } e.stopPropagation(); }}
                  aria-label="Search nodes"
                />
                {query && (
                  <button type="button" className="nxIconBtn" data-testid="flow-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </Panel>

          {/* on-canvas actions — fit-to-selection + hand-create */}
          <Panel position="top-right">
            <div className="nxFlowToolbar" data-testid="flow-actions">
              <button type="button" className="nxIconBtn nxFlowActionBtn" data-testid="flow-fit-selection" aria-label="Fit to selection" title="Fit to selection" onClick={fitSelection}>
                <Crosshair size={15} />
              </button>
              {canAdd && (
                <button type="button" className="nxIconBtn nxFlowActionBtn" data-testid="flow-add-node" aria-label={`Add ${object.labelOne}`} title={`Add ${object.labelOne}`} onClick={addNode}>
                  <SquarePlus size={15} />
                </button>
              )}
            </div>
          </Panel>

          {/* edge-type legend — names the two edge types so solid vs dashed reads.
             Hidden when grouped (the tinted panels fill the canvas + read as
             department colours already) and on mobile (no room). */}
          {secondaryField && !isMobile && !grouped && (
            <Panel position="bottom-center">
              <div className="nxFlowLegend" data-testid="flow-legend">
                <div className="nxFlowLegendRow">
                  <span className="nxFlowLegendLine" data-kind="primary" />
                  {activeField?.label ?? "Relation"}
                </div>
                <div className="nxFlowLegendRow">
                  <span className="nxFlowLegendLine" data-kind="secondary" />
                  {secondaryField.label}
                </div>
              </div>
            </Panel>
          )}

          <FlowControls fitOpts={fitOpts} lockable={lockable} locked={locked} onToggleLock={() => setLocked((v) => !v)} />
          <div style={{ display: "contents" }} data-testid="flow-minimap">
            <MiniMap
              pannable
              zoomable
              nodeClassName={(n) => (n.type === "group" ? "nxMiniGroup" : "")}
              nodeColor={(n) =>
                n.type === "record"
                  ? nodeAccent(colorField, (n.data as RecordNodeData).row) ?? "var(--nx-border-strong)"
                  : n.type === "group"
                    ? (n.data as GroupNodeData).color ?? "var(--nx-border)"
                    : "var(--nx-border-strong)"
              }
            />
          </div>
        </ReactFlow>

        <FlowContextMenu
          menu={menu}
          onClose={closeMenu}
          typeField={typeField}
          canAdd={canAdd}
          canRename={handEdit && inlineTitleType(labelField.type)}
          canDuplicate={handEdit && (!!onCreate || !!onCreateDraft)}
          canConnect={handEdit && selfRelation && !!onCreate && !!onPatch}
          canDelete={handEdit && !!onDelete}
          onAddNode={(at, type) => void menuAdd(at, type)}
          onChangeType={menuChangeType}
          onRename={setRenameRequest}
          onDuplicate={(id) => void menuDuplicate(id)}
          onAddConnected={(id, at) => void menuAddConnected(id, at)}
          onDelete={menuDelete}
        />

        {detailRow && (
          <NodeDetailPanel
            object={object}
            row={detailRow}
            fields={detailFields}
            colorField={colorField}
            readOnly={readOnly}
            onPatch={(id, patch) => onPatch?.(id, patch)}
            onOpen={(id) => { setDetailId(null); onOpen(id); }}
            onDelete={onDelete}
            onClose={() => setDetailId(null)}
            onJump={jumpTo}
          />
        )}
      </FlowActionsContext.Provider>
      <span className="nxFlowSrOnly" aria-live="polite">{announced}</span>
    </div>
  );
}
