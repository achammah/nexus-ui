import * as React from "react";
import { Trash2, X, Image as ImageIcon, MoveVertical } from "lucide-react";
import { COVER_PRESETS, isPresetCover } from "./snapshot";

/* CoverPicker — the page-cover menu. Bundled gradients + flat colours (pure CSS, nothing
   fetched) and an image upload stored as a data URI. No stock-photo provider: a keyed
   vendor and an external image host are both ruled out by the strict CSP, so the set is
   what ships plus what the user uploads.

   Reposition is offered only for uploaded images — a gradient has no focal point. */

const GRADIENTS = Object.keys(COVER_PRESETS).filter((k) => k.startsWith("preset:"));
const FLATS = Object.keys(COVER_PRESETS).filter((k) => k.startsWith("flat:"));

export interface CoverPickerProps {
  value?: string;
  onPick: (cover: string) => void;
  onRemove: () => void;
  onReposition?: () => void;   // hands control to the surface's drag-to-reposition mode
  onClose: () => void;
  sheet?: boolean;
}

export function CoverPicker({ value, onPick, onRemove, onReposition, onClose, sheet }: CoverPickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const upload = (file?: File) => {
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) { setErr("Pick an image file (PNG, JPG, GIF, SVG, WebP)."); return; }
    setBusy(true);
    const r = new FileReader();
    r.onload = () => { setBusy(false); onPick(String(r.result)); };
    r.onerror = () => { setBusy(false); setErr("That image could not be read."); };
    r.readAsDataURL(file);
  };

  const swatches = (keys: string[], testid: string) => (
    <div className="nxCoverPick-grid" data-testid={testid}>
      {keys.map((k) => (
        <button key={k} data-testid={`cover-${k.replace(":", "-")}`} title={k.split(":")[1]}
          className={value === k ? "is-on" : ""} style={{ background: COVER_PRESETS[k] }}
          onClick={() => onPick(k)} aria-label={k.split(":")[1]} />
      ))}
    </div>
  );

  return (
    <div className={`nxCoverPick${sheet ? " is-sheet" : ""}`} ref={rootRef} data-testid="cover-picker"
      role="dialog" aria-label="Page cover" onMouseDown={(e) => e.stopPropagation()}>
      <div className="nxCoverPick-head">
        <span>Cover</span>
        <div className="nxCoverPick-acts">
          {onReposition && value && !isPresetCover(value) && (
            <button data-testid="cover-reposition" onClick={() => { onReposition(); onClose(); }}><MoveVertical size={14} /><span>Reposition</span></button>
          )}
          <button data-testid="cover-remove" disabled={!value} onClick={() => { onRemove(); onClose(); }}><Trash2 size={14} /><span>Remove</span></button>
          <button className="nxCoverPick-x" title="Close" data-testid="cover-close" onClick={onClose}><X size={15} /></button>
        </div>
      </div>

      <div className="nxCoverPick-body"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}>
        <h4>Gradients</h4>
        {swatches(GRADIENTS, "cover-gradients")}
        <h4>Colours</h4>
        {swatches(FLATS, "cover-flats")}
        <h4>Upload</h4>
        <button className="nxCoverPick-drop" data-testid="cover-upload-open" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImageIcon size={18} /> {busy ? "Preparing…" : "Choose an image"}
        </button>
        {err && <div className="nxCoverPick-err" data-testid="cover-upload-error">{err}</div>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} data-testid="cover-upload-input"
          onChange={(e) => { upload(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = ""; }} />
      </div>
    </div>
  );
}

export default CoverPicker;
