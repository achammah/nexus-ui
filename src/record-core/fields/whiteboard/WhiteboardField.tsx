import * as React from "react";
import { createPortal } from "react-dom";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { Pencil, X } from "lucide-react";
import { Button } from "../../../primitives/Button";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { FieldRenderProps } from "../types";
import type { WhiteboardScene } from "./scene";
import { isScene, liveElements } from "./scene";
import { useNxTheme } from "./useNxTheme";
import { Thumbnail } from "./Thumbnail";

/* Whiteboard field editor — a per-record excalidraw canvas persisted as plain
   scene JSON through the record store's one-patch path (the richText model:
   seed-once local document keyed by row id at the mount site, debounced
   whole-value commits, a subtle Saving…/Saved chip).

   Save discipline: onChange fires for every interactive change including pure
   viewport moves; getSceneVersion only advances when ELEMENTS change, so pans/
   zooms/selection never write (no toast churn, no timeline noise). The value is
   ELEMENTS ONLY — a viewport is never persisted: scene coordinates absorb the
   authoring-time canvas offset, so a stored scroll re-applied on a differently
   laid-out mount can open on empty space. Every mount scrolls to content instead
   (a stored appState key from older writes is tolerated and ignored).

   Mobile (≤768px): the resting state is a static thumbnail + an Edit affordance —
   the page never traps touch scroll. Editing happens in a fullscreen overlay
   (portaled to <body>: the record page may sit inside the transformed peek panel,
   which would break position:fixed). Inside it, excalidraw's native touch handles
   one-finger draw/pan and pinch-zoom.

   v1 boundary: the image tool is off (scene stays lean JSON — no base64 blobs in
   the command log) and file-system canvas actions are hidden (an embedded field
   is not a file editor). */

type ExcalidrawElements = readonly { isDeleted?: boolean }[];

const UI_OPTIONS = {
  canvasActions: { loadScene: false, saveToActiveFile: false },
  tools: { image: false },
} as const;

export default function WhiteboardField({ field, row, value, readOnly, onSave }: FieldRenderProps) {
  const theme = useNxTheme();
  const mobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // seed-once PER CANVAS MOUNT: the canvas owns the live scene while mounted (the
  // mount site keys this component by row id, so a same-record poll never reseeds).
  // A desktop↔mobile flip or overlay open/close REMOUNTS the canvas — reseed from
  // the current value then (edits inside the 700ms debounce window at the exact
  // moment of a viewport-mode flip are the accepted edge; saves cover the rest).
  const epoch = `${mobile ? "m" : "d"}:${mobileOpen ? "open" : "rest"}`;
  const seed = React.useMemo(
    () => ({ elements: liveElements(value) as unknown[] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [epoch],
  );
  const lastVersion = React.useRef<number>(0);
  React.useMemo(() => { lastVersion.current = getSceneVersion(seed.elements as never); }, [seed]);

  const { saveState, trigger: saveScene } = useDebouncedSave<WhiteboardScene>((next) => onSave(next), 700);

  const onChange = React.useCallback(
    (elements: ExcalidrawElements) => {
      const v = getSceneVersion(elements as never);
      if (v === lastVersion.current) return; // viewport/selection only — never a write
      lastVersion.current = v;
      saveScene({ elements: elements.filter((e) => !e.isDeleted) as WhiteboardScene["elements"] });
    },
    [saveScene],
  );

  // a non-null value that is not a scene: render the designed invalid state; the
  // reset is an explicit, labeled user action — never an automatic overwrite
  if (value !== null && value !== undefined && value !== "" && !isScene(value)) {
    return (
      <span className="nxWbInvalid" data-testid={`wb-invalid-${field.key}`} role="group" aria-label={field.label}>
        <span>This {field.label.toLowerCase()} value is not a readable canvas scene.</span>
        {!readOnly && (
          <Button
            size="sm"
            variant="secondary"
            data-testid={`wb-reset-${field.key}`}
            onClick={() => onSave({ elements: [] })}
          >
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
    <Excalidraw
      key={epoch}
      theme={theme}
      viewModeEnabled={readOnly}
      UIOptions={UI_OPTIONS}
      initialData={{ elements: seed.elements as never, scrollToContent: true }}
      onChange={onChange as never}
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
          /* laddered escape: excalidraw consumes Escape for its own deselect; an
             Escape that bubbles out of the canvas closes the overlay (one level),
             matching the peek panel's step-back model. Done is the touch path. */
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
