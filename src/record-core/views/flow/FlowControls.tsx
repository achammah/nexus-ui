import * as React from "react";
import { Panel, useReactFlow, useStore } from "@xyflow/react";
import { Lock, LockOpen, Maximize, Minus, Plus } from "lucide-react";
import type { FitViewOptions } from "@xyflow/react";

/* Native zoom cluster — replaces xyflow's stock <Controls> so the canvas chrome
   speaks the app's control language (lucide stroke icons on --nx-* toolbar
   cards) instead of the widget's filled glyphs. One card: zoom out · a live
   zoom readout (click = back to 100%) · zoom in · fit · an optional layout
   lock. Zoom state comes straight from the xyflow store, so the readout tracks
   wheel/pinch zoom too. */

interface FlowControlsProps {
  fitOpts: FitViewOptions;
  /* the lock only renders when it governs something (drag or edge-draw) */
  lockable: boolean;
  locked: boolean;
  onToggleLock: () => void;
}

export default function FlowControls({ fitOpts, lockable, locked, onToggleLock }: FlowControlsProps) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const minZoom = useStore((s) => s.minZoom);
  const maxZoom = useStore((s) => s.maxZoom);

  return (
    <Panel position="bottom-left">
      <div className="nxFlowToolbar nxFlowZoombar" data-testid="flow-controls" role="group" aria-label="Canvas controls">
        <button
          type="button"
          className="nxIconBtn"
          data-testid="flow-zoom-out"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= minZoom}
          onClick={() => zoomOut({ duration: 150 })}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="nxFlowZoomPct"
          data-testid="flow-zoom-reset"
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
          onClick={() => zoomTo(1, { duration: 200 })}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="nxIconBtn"
          data-testid="flow-zoom-in"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= maxZoom}
          onClick={() => zoomIn({ duration: 150 })}
        >
          <Plus size={14} />
        </button>
        <span className="nxFlowZoomDivider" aria-hidden />
        <button
          type="button"
          className="nxIconBtn"
          data-testid="flow-fit-view"
          aria-label="Fit view"
          title="Fit view"
          onClick={() => fitView({ duration: 400, ...fitOpts })}
        >
          <Maximize size={14} />
        </button>
        {lockable && (
          <>
            <span className="nxFlowZoomDivider" aria-hidden />
            <button
              type="button"
              className="nxIconBtn"
              data-testid="flow-lock"
              data-active={locked}
              aria-pressed={locked}
              aria-label={locked ? "Unlock layout" : "Lock layout"}
              title={locked ? "Unlock layout (allow moving nodes)" : "Lock layout (pan and zoom only)"}
              onClick={onToggleLock}
            >
              {locked ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}
