import * as React from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import type { FieldDef, RecordRow } from "../../types";
import { formatCell } from "../../DataTable";
import { OptionChip, optionMeta } from "../../options";
import type { NodeShape } from "./flowConfig";
import { NODE_H, NODE_W } from "./layout";

/* Flow-view custom nodes — the record card (editable inline, resizable, shaped +
   colored per a config field), the cross-object hub chip, and the collapsible
   group container. Nodes stay lean data holders; every handler + capability flag
   comes from FlowActionsContext (set once by FlowView) so node data never carries
   callbacks and xyflow doesn't re-register node types on each render. */

export interface FlowActions {
  /* inline title editing + resize + hand-create are on */
  editable: boolean;
  /* draw edges by hand / drag-between-records-to-relate is on (self-relation only) */
  connectable: boolean;
  /* the select field tinting nodes, and the one giving them shapes (resolved) */
  colorField?: FieldDef;
  onCommitTitle: (id: string, key: string, value: string) => void;
  onResize: (id: string, width: number, height: number) => void;
  onOpenDetail: (id: string) => void;
  onToggleGroup: (groupValue: string) => void;
}

const noop = () => {};
export const FlowActionsContext = React.createContext<FlowActions>({
  editable: false,
  connectable: false,
  onCommitTitle: noop,
  onResize: noop,
  onOpenDetail: noop,
  onToggleGroup: noop,
});

export type RecordNodeData = {
  row: RecordRow;
  labelField: FieldDef;
  metaFields: FieldDef[];
  i: number;
  shape: NodeShape;
};
export type HubNodeData = { label: string; count: number; i: number };
export type GroupNodeData = { label: string; count: number; color?: string; collapsed: boolean; value: string };
export type FlowNode =
  | Node<RecordNodeData, "record">
  | Node<HubNodeData, "hub">
  | Node<GroupNodeData, "group">;

export const nodeTitle = (d: RecordNodeData): string =>
  formatCell(d.row[d.labelField.key], d.labelField.type) || String(d.row.id);

/* the accent color a node takes from the color field's chosen option (CSS var or
   none) — one place, reused by the card border/tint and the group header */
export const nodeAccent = (colorField: FieldDef | undefined, row: RecordRow): string | undefined => {
  if (!colorField) return undefined;
  const c = optionMeta(colorField, row[colorField.key]).color;
  return c ? `var(--nx-opt-${c})` : undefined;
};

/* which field types can be renamed inline on the node (typed editors live in the
   detail panel) */
const inlineTitleType = (t: string) => t === "text" || t === "longText" || t === "email" || t === "url";

export function RecordCardNode({ id, data, selected }: NodeProps<Node<RecordNodeData, "record">>) {
  const actions = React.useContext(FlowActionsContext);
  const accent = nodeAccent(actions.colorField, data.row);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const canRename = actions.editable && inlineTitleType(data.labelField.type);
  const showMeta = data.shape !== "diamond" && data.shape !== "hexagon"; // clipped shapes: title-only

  const startEdit = React.useCallback(() => {
    if (!canRename) return;
    setDraft(nodeTitle(data));
    setEditing(true);
  }, [canRename, data]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== nodeTitle(data)) actions.onCommitTitle(id, data.labelField.key, v);
  };

  return (
    <>
      {/* resizer + connect handles live OUTSIDE the card so a clipped shape
         (diamond/hexagon clip-path) never clips away their hit area */}
      {actions.editable && (
        <NodeResizer
          isVisible={selected}
          minWidth={140}
          minHeight={52}
          maxWidth={420}
          maxHeight={220}
          lineClassName="nxFlowResizeLine"
          handleClassName="nxFlowResizeHandle"
          onResizeEnd={(_e, p) => actions.onResize(id, Math.round(p.width), Math.round(p.height))}
        />
      )}
      <div
        className="nxFlowCard"
        data-testid={`flow-node-${id}`}
        data-shape={data.shape}
        data-accent={accent ? "1" : "0"}
        style={
          {
            "--i": data.i,
            "--nx-node-accent": accent ?? "var(--nx-border-strong)",
            width: "100%",
            height: "100%",
          } as React.CSSProperties
        }
      >
      <div className="nxFlowCardBody">
        {editing ? (
          <input
            className="nxFlowTitleEdit"
            data-testid={`flow-node-edit-${id}`}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
              e.stopPropagation(); // keep xyflow's delete/nav keys off the input
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="nxKTitle" onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }} title={canRename ? "Double-click to rename" : undefined}>
            {nodeTitle(data)}
            {canRename && <Pencil className="nxFlowTitleHint" size={11} aria-hidden />}
          </div>
        )}
        {showMeta && (
          <div className="nxKMeta">
            {data.metaFields.map((f) =>
              f.type === "select" ? (
                <OptionChip key={f.key} field={f} value={data.row[f.key]} />
              ) : (
                <span key={f.key}>{formatCell(data.row[f.key], f.type)}</span>
              ),
            )}
          </div>
        )}
        </div>
      </div>
      <Handle type="target" position={Position.Top} isConnectable={actions.connectable} className="nxFlowHandle" />
      <Handle type="source" position={Position.Bottom} isConnectable={actions.connectable} className="nxFlowHandle" />
    </>
  );
}

export function HubChipNode({ id, data }: NodeProps<Node<HubNodeData, "hub">>) {
  return (
    <div
      className="nxFlowHub"
      data-testid={`flow-${id.replaceAll(":", "-")}`}
      style={{ "--i": data.i } as React.CSSProperties}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="nxFlowHandle" />
      <span className="nxFlowHubLabel">{data.label}</span>
      <span className="nxCount">{data.count}</span>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="nxFlowHandle" />
    </div>
  );
}

/* the subflow container — a labeled well behind its member cards, with a collapse
   toggle in the header (children hide when collapsed, the container shrinks) */
export function GroupContainerNode({ data }: NodeProps<Node<GroupNodeData, "group">>) {
  const actions = React.useContext(FlowActionsContext);
  const Chevron = data.collapsed ? ChevronRight : ChevronDown;
  return (
    <div
      className="nxFlowGroup"
      data-testid={`flow-group-${data.value}`}
      data-collapsed={data.collapsed ? "1" : "0"}
      style={{ "--nx-group-accent": data.color ?? "var(--nx-border-strong)" } as React.CSSProperties}
    >
      <button
        type="button"
        className="nxFlowGroupHeader"
        data-testid={`flow-group-toggle-${data.value}`}
        onClick={(e) => { e.stopPropagation(); actions.onToggleGroup(data.value); }}
        aria-expanded={!data.collapsed}
      >
        <Chevron size={14} aria-hidden />
        <span className="nxFlowGroupLabel">{data.label}</span>
        <span className="nxCount">{data.count}</span>
      </button>
    </div>
  );
}

/* module-scope registration — a stable identity keeps xyflow from re-registering */
export const nodeTypes = {
  record: RecordCardNode,
  hub: HubChipNode,
  group: GroupContainerNode,
};

export { NODE_W, NODE_H };
