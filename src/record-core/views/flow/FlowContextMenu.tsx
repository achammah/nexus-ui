import * as React from "react";
import { createPortal } from "react-dom";
import { Copy, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import type { FieldDef } from "../../types";
import { optionMeta } from "../../options";

/* Right-click editor menu — the n8n-class affordance that makes the canvas a
   flow EDITOR, not a diagram: right-click empty canvas → add a node (typed,
   at the cursor); right-click a node → change type / rename / duplicate /
   add a connected node / delete. Pure presentation: every action arrives as
   a handler from FlowView, which owns store semantics (records on the record
   view, the per-page content store on free-surface pages) — so persistence
   rides the exact same paths as the toolbar + drag edits. Rendered as a
   controlled dropdown anchored to a fixed-position phantom at the cursor
   (radix portals escape the canvas' overflow clip; Escape + outside-click
   dismiss come with it). Delete is a two-step arm inside the menu. */

export type FlowMenuState =
  | { kind: "pane"; x: number; y: number }
  | { kind: "node"; x: number; y: number; nodeId: string; nodeTitle: string; typeValue?: string }
  | null;

interface FlowContextMenuProps {
  menu: FlowMenuState;
  onClose: () => void;
  /* the select field defining the node "type" (shape/color source) — absent on
     objects without one; hides typed-add + change-type */
  typeField?: FieldDef;
  canAdd: boolean;
  canRename: boolean;
  canDuplicate: boolean;
  canConnect: boolean;
  canDelete: boolean;
  onAddNode: (at: { x: number; y: number }, type?: string) => void;
  onChangeType: (id: string, value: string) => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddConnected: (id: string, at: { x: number; y: number }) => void;
  onDelete: (id: string) => void;
}

const typeOptions = (field: FieldDef | undefined) =>
  (field?.options ?? []).map((o) => optionMeta(field!, typeof o === "string" ? o : o.value));

/* the option's color chip, in the option-token palette the cards already use */
function TypeDot({ color }: { color?: string }) {
  return <span className="nxFlowMenuDot" style={{ background: color ? `var(--nx-opt-${color})` : "var(--nx-border-strong)" }} aria-hidden />;
}

/* The cursor anchor is PORTALED to <body>: position:fixed resolves against the
   nearest transformed ancestor, and .nxFlowWrap keeps an identity transform
   from its entrance animation — an in-tree phantom therefore lands offset by
   exactly the wrap's viewport origin (measured: menu dx/dy == wrap x/y), so
   the menu opened far from the cursor. Body carries no transform; anchored
   there, the phantom's rect IS the cursor. Radix's asChild merges its ref +
   trigger props through the forwardRef into the portaled span. */
const CursorAnchor = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { x: number; y: number }
>(function CursorAnchor({ x, y, style: _ignored, ...rest }, ref) {
  return createPortal(
    <span
      {...rest}
      ref={ref}
      style={{ position: "fixed", left: x, top: y, width: 1, height: 1, pointerEvents: "none" }}
      aria-hidden
    />,
    document.body,
  );
});

export default function FlowContextMenu({
  menu, onClose, typeField,
  canAdd, canRename, canDuplicate, canConnect, canDelete,
  onAddNode, onChangeType, onRename, onDuplicate, onAddConnected, onDelete,
}: FlowContextMenuProps) {
  const [armedDelete, setArmedDelete] = React.useState(false);
  React.useEffect(() => setArmedDelete(false), [menu]);

  const options = typeOptions(typeField);
  const at = menu ? { x: menu.x, y: menu.y } : { x: 0, y: 0 };

  return (
    // key forces a fresh mount per invocation so the popper re-measures at the new cursor anchor
    <DropdownMenu key={menu ? `${menu.kind}:${menu.x}:${menu.y}` : "closed"} open={!!menu} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DropdownMenuTrigger asChild>
        <CursorAnchor x={at.x} y={at.y} />
      </DropdownMenuTrigger>
      {menu?.kind === "pane" && (
        <DropdownMenuContent align="start" sideOffset={2} className="nxFlowMenu" data-testid="flow-menu-pane">
          <DropdownMenuLabel>Add node</DropdownMenuLabel>
          {canAdd && options.length > 0 ? (
            options.map((o) => (
              <DropdownMenuItem key={o.value} data-testid={`flow-menu-add-${o.value}`} onSelect={() => { onAddNode(at, o.value); onClose(); }}>
                <TypeDot color={o.color} />
                {o.label || o.value}
              </DropdownMenuItem>
            ))
          ) : canAdd ? (
            <DropdownMenuItem data-testid="flow-menu-add" onSelect={() => { onAddNode(at); onClose(); }}>
              <Plus size={14} />
              New node
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      )}
      {menu?.kind === "node" && (
        <DropdownMenuContent align="start" sideOffset={2} className="nxFlowMenu" data-testid="flow-menu-node">
          <DropdownMenuLabel className="nxFlowMenuTitle">{menu.nodeTitle}</DropdownMenuLabel>
          {typeField && options.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="flow-menu-type">
                <TypeDot color={options.find((o) => o.value === menu.typeValue)?.color} />
                Change {typeField.label.toLowerCase()}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="nxFlowMenu">
                {options.map((o) => (
                  <DropdownMenuItem
                    key={o.value}
                    data-testid={`flow-menu-type-${o.value}`}
                    data-current={o.value === menu.typeValue || undefined}
                    onSelect={() => { onChangeType(menu.nodeId, o.value); onClose(); }}
                  >
                    <TypeDot color={o.color} />
                    {o.label || o.value}
                    {o.value === menu.typeValue && <span className="nxFlowMenuCheck" aria-hidden>✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {canRename && (
            <DropdownMenuItem data-testid="flow-menu-rename" onSelect={() => { onRename(menu.nodeId); onClose(); }}>
              <Pencil size={14} />
              Rename
            </DropdownMenuItem>
          )}
          {canDuplicate && (
            <DropdownMenuItem data-testid="flow-menu-duplicate" onSelect={() => { onDuplicate(menu.nodeId); onClose(); }}>
              <Copy size={14} />
              Duplicate
            </DropdownMenuItem>
          )}
          {canConnect && (
            <DropdownMenuItem data-testid="flow-menu-connect" onSelect={() => { onAddConnected(menu.nodeId, at); onClose(); }}>
              <Link2 size={14} />
              Add connected node
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                data-testid={armedDelete ? "flow-menu-delete-confirm" : "flow-menu-delete"}
                onSelect={(e) => {
                  if (!armedDelete) { e.preventDefault(); setArmedDelete(true); return; }
                  onDelete(menu.nodeId);
                  onClose();
                }}
              >
                <Trash2 size={14} />
                {armedDelete ? "Confirm delete" : "Delete…"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
