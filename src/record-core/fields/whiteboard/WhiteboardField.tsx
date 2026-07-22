import * as React from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { Button } from "../../../primitives/Button";
import type { SaveState } from "../../../hooks/useDebouncedSave";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { FieldRenderProps } from "../types";
import type { FieldDef } from "../../types";
import type { WhiteboardScene } from "./scene";
import { isScene } from "./scene";
import { resolveWhiteboardConfig } from "./config";
import { Thumbnail } from "./Thumbnail";
import WhiteboardCanvas from "./WhiteboardCanvas";

/* Whiteboard field editor — a per-record, FULL-DEPTH excalidraw canvas persisted as
   scene JSON ({ elements, files? }) through the record store's one-patch path. The
   depth (every native tool surfaced, the ops rail — boolean/arrange/templates/palette
   — image + record drop, and the presence seam) lives in WhiteboardCanvas; this file
   owns the field lifecycle: config resolution, the invalid-value state, the mobile
   preview↔overlay flip, and the Saving…/Saved chip.

   Save discipline is unchanged: WhiteboardCanvas only writes when ELEMENTS or the
   referenced image FILES change (viewport/selection/presence never write); the value
   is elements (+ image files only when an image is on the board).

   Mobile (≤768px): the resting state is a static thumbnail + an Edit affordance — the
   page never traps touch scroll. Editing happens in a fullscreen overlay (portaled to
   <body>), where excalidraw's native touch handles draw/pan/pinch. */

export default function WhiteboardField({ field, row, value, readOnly, onSave }: FieldRenderProps) {
  const mobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const config = React.useMemo(() => resolveWhiteboardConfig((field as FieldDef).whiteboard), [field]);
  const boardId = React.useMemo(() => `wb:${field.key}:${String((row as { id?: unknown })?.id ?? "new")}`, [field.key, row]);

  // remount key: a desktop↔mobile flip or overlay open/close remounts the canvas so it
  // reseeds from the current value (the 700ms-debounce edge at the flip is accepted).
  const epoch = `${mobile ? "m" : "d"}:${mobileOpen ? "open" : "rest"}`;

  // a non-null value that is not a scene: the designed invalid state; the reset is an
  // explicit, labeled user action — never an automatic overwrite.
  if (value !== null && value !== undefined && value !== "" && !isScene(value)) {
    return (
      <span className="nxWbInvalid" data-testid={`wb-invalid-${field.key}`} role="group" aria-label={field.label}>
        <span>This {field.label.toLowerCase()} value is not a readable canvas scene.</span>
        {!readOnly && (
          <Button size="sm" variant="secondary" data-testid={`wb-reset-${field.key}`} onClick={() => onSave({ elements: [] })}>
            Replace with a blank canvas
          </Button>
        )}
      </span>
    );
  }

  const saveChip = saveState !== "idle" && (
    <span
      data-testid={`whiteboard-save-${field.key}`}
      data-state={saveState}
      role="status"
      style={{ font: "var(--nx-text-meta)", color: "var(--nx-fg-faint)", alignSelf: "flex-end" }}
    >
      {saveState === "saving" ? "Saving…" : "Saved"}
    </span>
  );

  const canvas = (
    <WhiteboardCanvas
      key={epoch}
      value={value}
      onSave={onSave as (v: WhiteboardScene) => void}
      readOnly={readOnly}
      config={config}
      boardId={boardId}
      epoch={epoch}
      onSaveState={setSaveState}
    />
  );

  // mobile rest state: static preview + Edit; the canvas mounts only in the overlay
  if (mobile && !mobileOpen) {
    return (
      <span className="nxWbPreview" role="group" aria-label={field.label} data-testid={`field-${field.key}`}>
        <Thumbnail field={field} row={row} value={value} />
        {!readOnly && (
          <Button size="sm" variant="secondary" icon={<Pencil size={13} />} data-testid={`wb-edit-${field.key}`} onClick={() => setMobileOpen(true)}>
            Edit canvas
          </Button>
        )}
        {saveChip}
      </span>
    );
  }

  if (mobile && mobileOpen) {
    return (
      <>
        <span className="nxWbPreview" role="group" aria-label={field.label} data-testid={`field-${field.key}`}>
          <Thumbnail field={field} row={row} value={value} />
          {saveChip}
        </span>
        {createPortal(
          <div
            className="nxWbOverlay nx-rise-in-sm"
            role="dialog"
            aria-label={field.label}
            data-testid={`wb-overlay-${field.key}`}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setMobileOpen(false); } }}
          >
            <div className="nxWbOverlayHead">
              <span className="nxWbOverlayTitle">{field.label}</span>
              {saveChip}
              <Button size="sm" variant="secondary" icon={<X size={13} />} data-testid={`wb-done-${field.key}`} onClick={() => setMobileOpen(false)}>
                Done
              </Button>
            </div>
            <div className="nxWbOverlayBody">{canvas}</div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <span className="nxWbHost" role="group" aria-label={field.label} data-testid={`field-${field.key}`}>
      <div className="nxWbCanvas">{canvas}</div>
      {saveChip}
    </span>
  );
}
