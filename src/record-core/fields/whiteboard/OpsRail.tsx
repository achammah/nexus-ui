import * as React from "react";
import { convertToExcalidrawElements, CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  Palette, LayoutTemplate, Combine, Layers, Users,
  Plus, Minus, Diff, SquareDot, Scissors,
  ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Group, Ungroup,
} from "lucide-react";
import { applyBoolean, splitElement, isBooleanEligible, isSplittable, type BooleanOp } from "./geometry";
import { bringToFront, sendToBack, bringForward, sendBackward, groupSelected, ungroupSelected, hasSharedGroup } from "./arrange";
import type { ResolvedTemplate } from "./templates";
import type { ResolvedWhiteboardConfig } from "./config";
import type { PresencePeer } from "./presence";
import { touch, type WbApi, type WbElement } from "./wbTypes";

/* The whiteboard ops rail — the surfaced controls excalidraw does not put in its
   toolbar: a config palette, insertable templates, boolean/shape ops (add/subtract/
   intersect/exclude/split — the geometry layer excalidraw lacks natively), z-order +
   group/ungroup, and live-presence avatars. Rendered through excalidraw's
   renderTopRightUI so it lives INSIDE the canvas chrome and inherits the --nx-* theme.
   Every cluster is config-gated. Operations run on the imperative API; new geometry
   is built with convertToExcalidrawElements and every change is captured for undo. */

interface OpsRailProps {
  api: WbApi;
  config: ResolvedWhiteboardConfig;
  /* live selection snapshot (the only reactive app-state the rail needs; viewport is
     read from the imperative API at insert time) */
  selection: Record<string, boolean>;
  compact: boolean;
  templates: ResolvedTemplate[];
  peers: PresencePeer[];
}

const bounds = (els: readonly WbElement[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) {
    const x = Number(e.x) || 0, y = Number(e.y) || 0, w = Number(e.width) || 0, h = Number(e.height) || 0;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  return { minX, minY, maxX, maxY };
};

function Cluster({
  id, icon, title, open, setOpen, disabled, badge, children,
}: {
  id: string; icon: React.ReactNode; title: string; open: string | null;
  setOpen: (v: string | null) => void; disabled?: boolean; badge?: React.ReactNode; children: React.ReactNode;
}) {
  const isOpen = open === id;
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isOpen, setOpen]);
  return (
    <div className="nxWbOpsCluster" ref={ref}>
      <button
        type="button"
        className="nxWbOpsBtn"
        data-testid={`wb-ops-${id}`}
        data-open={isOpen ? "" : undefined}
        title={title}
        aria-label={title}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setOpen(isOpen ? null : id)}
      >
        {icon}
        {badge}
      </button>
      {isOpen && <div className="nxWbOpsPanel" role="menu" data-testid={`wb-ops-panel-${id}`}>{children}</div>}
    </div>
  );
}

const MenuItem = ({ onClick, disabled, icon, children, testid }: {
  onClick: () => void; disabled?: boolean; icon?: React.ReactNode; children: React.ReactNode; testid?: string;
}) => (
  <button type="button" role="menuitem" className="nxWbOpsItem" onClick={onClick} disabled={disabled} data-testid={testid}>
    {icon && <span className="nxWbOpsItemIcon" aria-hidden>{icon}</span>}
    <span>{children}</span>
  </button>
);

export default function OpsRail({ api, config, selection, compact, templates, peers }: OpsRailProps) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [channel, setChannel] = React.useState<"backgroundColor" | "strokeColor">("backgroundColor");

  const flash = React.useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout((flash as unknown as { t?: number }).t);
    (flash as unknown as { t?: number }).t = window.setTimeout(() => setMsg(null), 3200);
  }, []);

  const selectedIds = React.useMemo(
    () => Object.entries(selection || {}).filter(([, v]) => v).map(([k]) => k),
    [selection],
  );
  const selected = React.useMemo(
    () => api.getSceneElements().filter((e) => selectedIds.includes(e.id)),
    [api, selectedIds],
  );
  const eligibleCount = selected.filter(isBooleanEligible).length;
  const splittable = selected.some(isSplittable);
  const canGroup = selectedIds.length >= 2;
  const canUngroup = hasSharedGroup(api.getSceneElements() as WbElement[], selectedIds);

  const commit = React.useCallback((elements: WbElement[]) => {
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [api]);

  const runBoolean = (op: BooleanOp) => {
    setOpen(null);
    const res = applyBoolean(op, selected as WbElement[]);
    if ("error" in res) { flash(res.error); return; }
    const created = convertToExcalidrawElements(res.skeletons as never) as unknown as WbElement[];
    const kept = api.getSceneElements().filter((e) => !res.removeIds.includes(e.id)) as WbElement[];
    commit([...kept, ...created]);
    flash(res.note ?? `${op.charAt(0).toUpperCase() + op.slice(1)} applied.`);
  };

  const runSplit = () => {
    setOpen(null);
    const target = (selected as WbElement[]).find(isSplittable);
    if (!target) { flash("Select a combined shape to split it back into pieces."); return; }
    const res = splitElement(target);
    if ("error" in res) { flash(res.error); return; }
    const created = convertToExcalidrawElements(res.skeletons as never) as unknown as WbElement[];
    const kept = api.getSceneElements().filter((e) => !res.removeIds.includes(e.id)) as WbElement[];
    commit([...kept, ...created]);
    flash("Split into pieces.");
  };

  const runArrange = (fn: (els: WbElement[], ids: string[]) => WbElement[]) => {
    setOpen(null);
    if (selectedIds.length === 0) { flash("Select a shape first."); return; }
    const next = fn(api.getSceneElements() as WbElement[], selectedIds);
    const idset = new Set(selectedIds);
    commit(next.map((e) => (idset.has(e.id) ? touch(e) : e)));
  };

  const insertTemplate = (t: ResolvedTemplate) => {
    setOpen(null);
    const created = convertToExcalidrawElements(t.skeletons as never) as unknown as WbElement[];
    const b = bounds(created);
    const as = api.getAppState();
    const z = as.zoom?.value || 1;
    const cx = as.width / 2 / z - as.scrollX;
    const cy = as.height / 2 / z - as.scrollY;
    const dx = cx - (b.minX + b.maxX) / 2;
    const dy = cy - (b.minY + b.maxY) / 2;
    const placed = created.map((e) => ({ ...e, x: (Number(e.x) || 0) + dx, y: (Number(e.y) || 0) + dy }));
    commit([...(api.getSceneElements() as WbElement[]), ...placed]);
    flash(`Inserted “${t.label}”.`);
  };

  const applyColor = (color: string) => {
    const idset = new Set(selectedIds);
    if (idset.size) {
      const next = (api.getSceneElements() as WbElement[]).map((e) => (idset.has(e.id) ? touch({ ...e, [channel]: color }) : e));
      commit(next);
    }
    api.updateScene({ appState: { [channel === "backgroundColor" ? "currentItemBackgroundColor" : "currentItemStrokeColor"]: color } });
  };

  const showPalette = config.palette.length > 0;
  const showTemplates = templates.length > 0;
  const showBoolean = config.booleanOps;
  const showArrange = config.arrange;
  const showPresence = config.presence;
  if (!showPalette && !showTemplates && !showBoolean && !showArrange && !showPresence) return null;

  return (
    <div className={`nxWbOps${compact ? " nxWbOps--compact" : ""}`} data-testid="wb-ops-rail">
      {showPalette && (
        <Cluster id="palette" icon={<Palette size={16} />} title="Colors" open={open} setOpen={setOpen}>
          <div className="nxWbOpsChannels" role="tablist">
            <button type="button" role="tab" aria-selected={channel === "backgroundColor"} className="nxWbOpsChan" data-active={channel === "backgroundColor" ? "" : undefined} onClick={() => setChannel("backgroundColor")}>Fill</button>
            <button type="button" role="tab" aria-selected={channel === "strokeColor"} className="nxWbOpsChan" data-active={channel === "strokeColor" ? "" : undefined} onClick={() => setChannel("strokeColor")}>Stroke</button>
          </div>
          <div className="nxWbOpsSwatches">
            {config.palette.map((c) => (
              <button key={c} type="button" className="nxWbOpsSwatch" style={{ background: c }} title={c} aria-label={`${channel === "backgroundColor" ? "Fill" : "Stroke"} ${c}`} data-testid={`wb-swatch-${c}`} onClick={() => applyColor(c)} />
            ))}
            <button type="button" className="nxWbOpsSwatch nxWbOpsSwatch--none" title="Transparent fill" aria-label="Transparent" onClick={() => applyColor("transparent")} />
          </div>
        </Cluster>
      )}

      {showTemplates && (
        <Cluster id="templates" icon={<LayoutTemplate size={16} />} title="Templates" open={open} setOpen={setOpen}>
          {templates.map((t) => (
            <MenuItem key={t.key} testid={`wb-template-${t.key}`} onClick={() => insertTemplate(t)}>{t.label}</MenuItem>
          ))}
        </Cluster>
      )}

      {showBoolean && (
        <Cluster id="combine" icon={<Combine size={16} />} title="Combine shapes" open={open} setOpen={setOpen}>
          <div className="nxWbOpsHint">{eligibleCount >= 2 ? `${eligibleCount} shapes selected` : "Select 2+ closed shapes"}</div>
          <MenuItem testid="wb-bool-union" icon={<Plus size={14} />} disabled={eligibleCount < 2} onClick={() => runBoolean("union")}>Add (union)</MenuItem>
          <MenuItem testid="wb-bool-subtract" icon={<Minus size={14} />} disabled={eligibleCount < 2} onClick={() => runBoolean("subtract")}>Subtract</MenuItem>
          <MenuItem testid="wb-bool-intersect" icon={<SquareDot size={14} />} disabled={eligibleCount < 2} onClick={() => runBoolean("intersect")}>Intersect</MenuItem>
          <MenuItem testid="wb-bool-exclude" icon={<Diff size={14} />} disabled={eligibleCount < 2} onClick={() => runBoolean("exclude")}>Exclude</MenuItem>
          <div className="nxWbOpsSep" />
          <MenuItem testid="wb-bool-split" icon={<Scissors size={14} />} disabled={!splittable} onClick={runSplit}>Split apart</MenuItem>
        </Cluster>
      )}

      {showArrange && (
        <Cluster id="arrange" icon={<Layers size={16} />} title="Arrange" open={open} setOpen={setOpen}>
          <MenuItem testid="wb-arr-front" icon={<ChevronsUp size={14} />} onClick={() => runArrange(bringToFront)}>Bring to front</MenuItem>
          <MenuItem testid="wb-arr-forward" icon={<ChevronUp size={14} />} onClick={() => runArrange(bringForward)}>Bring forward</MenuItem>
          <MenuItem testid="wb-arr-backward" icon={<ChevronDown size={14} />} onClick={() => runArrange(sendBackward)}>Send backward</MenuItem>
          <MenuItem testid="wb-arr-back" icon={<ChevronsDown size={14} />} onClick={() => runArrange(sendToBack)}>Send to back</MenuItem>
          <div className="nxWbOpsSep" />
          <MenuItem testid="wb-arr-group" icon={<Group size={14} />} disabled={!canGroup} onClick={() => runArrange(groupSelected)}>Group</MenuItem>
          <MenuItem testid="wb-arr-ungroup" icon={<Ungroup size={14} />} disabled={!canUngroup} onClick={() => runArrange(ungroupSelected)}>Ungroup</MenuItem>
        </Cluster>
      )}

      {showPresence && (
        <Cluster id="presence" icon={<Users size={16} />} title="Who's here" open={open} setOpen={setOpen} badge={peers.length > 0 ? <span className="nxWbOpsDot" aria-hidden /> : undefined}>
          <div className="nxWbOpsHint">{peers.length === 0 ? "You're the only one here" : `${peers.length + 1} people on this board`}</div>
          <div className="nxWbPresenceList">
            <span className="nxWbAvatar" style={{ background: "var(--nx-accent)" }} title="You">You</span>
            {peers.map((p) => (
              <span key={p.id} className="nxWbAvatar" style={{ background: p.color }} title={p.username} data-testid={`wb-peer-${p.id}`}>
                {p.username.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
        </Cluster>
      )}

      {msg && <div className="nxWbOpsToast" role="status" data-testid="wb-ops-toast">{msg}</div>}
    </div>
  );
}
