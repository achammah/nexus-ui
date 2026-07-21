// adapted from xyflow/xyflow examples/react Layouting (MIT) — the layout wiring shape only
import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  Handle,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./flow.css";
import { Network } from "lucide-react";
import type { ViewProps } from "../types";
import type { FieldDef, RecordRow } from "../../types";
import { formatCell } from "../../DataTable";
import { OptionChip } from "../../options";
import {
  buildGraph,
  cardMetaFields,
  positionsFor,
  positionsPatch,
  resolveLabelField,
  resolveRelation,
  type XY,
} from "./graph";
import { layoutGraph, HUB_H, HUB_W, NODE_H, NODE_W } from "./layout";

/* FlowView — an object's records as a node graph: record cards as nodes, one
   configured relation as edges (self-relations draw record→record parent edges;
   cross-object relations draw target hub chips). Pan/zoom/minimap from xyflow;
   drag-arrange persists per-node positions into the viewState bag (UI state,
   never record data). Loaded as a React.lazy chunk — the registry definition
   stays eager and light. Layout wiring (compute positions → set nodes →
   fitView) adapted from xyflow examples/react Layouting (MIT). */

type RecordNodeData = { row: RecordRow; labelField: FieldDef; metaFields: FieldDef[]; i: number };
type HubNodeData = { label: string; count: number; i: number };
type FlowNode = Node<RecordNodeData, "record"> | Node<HubNodeData, "hub">;

const nodeTitle = (d: RecordNodeData) => formatCell(d.row[d.labelField.key], d.labelField.type) || String(d.row.id);

/* anchors only — connections are never drawn in this view (flow.css hides them) */
const anchors = (
  <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>
);

function RecordCardNode({ id, data }: NodeProps<Node<RecordNodeData, "record">>) {
  return (
    <div
      className="nxFlowCard"
      data-testid={`flow-node-${id}`}
      style={{ "--i": data.i } as React.CSSProperties}
    >
      <div className="nxKTitle">{nodeTitle(data)}</div>
      <div className="nxKMeta">
        {data.metaFields.map((f) =>
          f.type === "select" ? (
            <OptionChip key={f.key} field={f} value={data.row[f.key]} />
          ) : (
            <span key={f.key}>{formatCell(data.row[f.key], f.type)}</span>
          ),
        )}
      </div>
      {anchors}
    </div>
  );
}

function HubChipNode({ id, data }: NodeProps<Node<HubNodeData, "hub">>) {
  return (
    <div
      className="nxFlowHub"
      data-testid={`flow-${id.replaceAll(":", "-")}`}
      style={{ "--i": data.i } as React.CSSProperties}
      title={data.label}
    >
      <span className="nxFlowHubLabel">{data.label}</span>
      <span className="nxCount">{data.count}</span>
      {anchors}
    </div>
  );
}

/* module-scope: a stable identity keeps xyflow from re-registering node types */
const nodeTypes: NodeTypes = { record: RecordCardNode, hub: HubChipNode };

/* re-fit the viewport when the edge relation (and so the whole layout) changes */
function FitOnRelationChange({ relationKey }: { relationKey: string }) {
  const { fitView } = useReactFlow();
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false; // the initial fit is the fitView prop's job
      return;
    }
    const t = window.setTimeout(() => fitView({ duration: 180 }), 30);
    return () => window.clearTimeout(t);
  }, [relationKey, fitView]);
  return null;
}

export default function FlowView({ object, rows, readOnly, viewConfig, viewState, onViewState, onOpen }: ViewProps) {
  const relationKey = resolveRelation(object, viewConfig, viewState);
  const labelField = resolveLabelField(object, viewConfig);
  const metaFields = React.useMemo(() => cardMetaFields(object, relationKey), [object, relationKey]);
  const graph = React.useMemo(() => buildGraph(object, rows, relationKey), [object, rows, relationKey]);
  // layout re-runs on STRUCTURE change (ids + edges), not on row-content edits
  const layoutKey = React.useMemo(
    () => graph.nodes.map((n) => n.id).join("|") + "#" + graph.edges.map((e) => e.id).join("|"),
    [graph],
  );
  const layout = React.useMemo(
    () => layoutGraph(graph.nodes, graph.edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );
  const persisted = positionsFor(viewState, relationKey);

  const rfNodes = React.useMemo<FlowNode[]>(
    () =>
      graph.nodes.map((n, idx) => {
        const i = Math.min(idx, 11); // stagger caps: late nodes enter together
        const position: XY = persisted[n.id] ?? layout[n.id] ?? { x: 0, y: 0 };
        return n.kind === "record"
          ? {
              id: n.id,
              type: "record" as const,
              position,
              width: NODE_W,
              height: NODE_H,
              ariaLabel: nodeTitle({ row: n.row, labelField, metaFields, i }),
              data: { row: n.row, labelField, metaFields, i },
            }
          : {
              id: n.id,
              type: "hub" as const,
              position,
              width: HUB_W,
              height: HUB_H,
              ariaLabel: n.label,
              data: { label: n.label, count: n.count, i },
            };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, layout, viewState.flowPos, relationKey, labelField, metaFields],
  );
  const rfEdges = React.useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      })),
    [graph],
  );

  // xyflow owns in-flight drag state; external truth (rows/relation/persisted
  // positions) rebuilds it — same wiring as the xyflow Layouting example
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(rfEdges);
  React.useEffect(() => setNodes(rfNodes), [rfNodes, setNodes]);
  React.useEffect(() => setEdges(rfEdges), [rfEdges, setEdges]);

  const [announced, setAnnounced] = React.useState("");
  const onNodeDragStop = React.useCallback<OnNodeDrag<FlowNode>>(
    (_e, node, dragged) => {
      const movedNodes = dragged?.length ? dragged : [node];
      const moved: Record<string, XY> = {};
      for (const n of movedNodes) moved[n.id] = { x: n.position.x, y: n.position.y };
      onViewState(positionsPatch(viewState, relationKey, moved));
      const label = node.type === "record" ? nodeTitle(node.data as RecordNodeData) : (node.data as HubNodeData).label;
      setAnnounced(`${label} moved`);
    },
    [onViewState, viewState, relationKey],
  );

  const open = React.useCallback(
    (node: FlowNode) => {
      if (node.type === "record") onOpen(node.id); // hubs are another object's records — no cross-object peek
    },
    [onOpen],
  );
  // Enter/Space on a focused node wrapper = the click path (one tab stop per node)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target as HTMLElement | null;
    const id = el?.classList?.contains("react-flow__node") ? el.getAttribute("data-id") : null;
    if (!id) return;
    const node = nodes.find((n) => n.id === id);
    if (node) {
      e.preventDefault();
      open(node);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="nxCard nxFlowEmpty nx-rise-in" data-testid="flow-empty">
        <Network size={22} />
        <b>Nothing to map yet</b>
        <span>
          {object.label} appear here as a graph — records as cards, linked records connected by edges.
        </span>
      </div>
    );
  }

  return (
    <div
      className="nxFlowWrap nx-rise-in"
      data-testid={`flow-${object.key}`}
      role="region"
      aria-label={`${object.label} flow graph`}
      onKeyDown={onKeyDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_e, node) => open(node)}
        onNodeDragStop={onNodeDragStop}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        nodeDragThreshold={6}
        fitView
        fitViewOptions={{ padding: 0.16, maxZoom: 1.4 }}
        minZoom={0.05}
        onlyRenderVisibleElements
        defaultMarkerColor={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <div style={{ display: "contents" }} data-testid="flow-controls">
          <Controls showInteractive={false} orientation="horizontal" />
        </div>
        <div style={{ display: "contents" }} data-testid="flow-minimap">
          <MiniMap pannable zoomable />
        </div>
        <FitOnRelationChange relationKey={relationKey} />
      </ReactFlow>
      <span className="nxFlowSrOnly" aria-live="polite">
        {announced}
      </span>
    </div>
  );
}
