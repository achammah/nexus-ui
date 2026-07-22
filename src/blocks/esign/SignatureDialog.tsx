// Signature capture dialog — draw (pointer canvas), type (styled fonts), or
// upload (PNG/JPEG). Pure DOM + tokens; returns an EsignSignatureValue.
import * as React from "react";
import type { EsignSignatureValue } from "./snapshot";

export interface SignatureDialogProps {
  open: boolean;
  kind: "signature" | "initials";
  signerName: string;
  onCancel: () => void;
  onDone: (value: EsignSignatureValue) => void;
}

const FONTS: Array<{ id: string; css: string; label: string }> = [
  { id: "cursive-1", css: "'Snell Roundhand','Segoe Script','Brush Script MT',cursive", label: "Script" },
  { id: "cursive-2", css: "'Bradley Hand','Comic Sans MS',cursive", label: "Casual" },
  { id: "serif-1", css: "'Iowan Old Style','Georgia',serif", label: "Serif" },
];
export const signatureFontCss = (id?: string): string =>
  FONTS.find((f) => f.id === id)?.css ?? FONTS[0].css;

type Tab = "draw" | "type" | "upload";

export function SignatureDialog({ open, kind, signerName, onCancel, onDone }: SignatureDialogProps) {
  const [tab, setTab] = React.useState<Tab>("draw");
  const [typed, setTyped] = React.useState("");
  const [fontId, setFontId] = React.useState(FONTS[0].id);
  const [uploadUrl, setUploadUrl] = React.useState<string | null>(null);
  const [hasInk, setHasInk] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTab("draw");
    setTyped(kind === "initials" ? initialsOf(signerName) : signerName);
    setUploadUrl(null);
    setHasInk(false);
  }, [open, kind, signerName]);

  React.useEffect(() => {
    if (!open || tab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--nx-fg") || "#1c2733";
    }
  }, [open, tab]);

  if (!open) return null;

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  };
  const onUp = () => { drawing.current = false; last.current = null; };
  const clearInk = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadUrl(String(reader.result));
    reader.readAsDataURL(file);
  };
  const canAdopt = tab === "draw" ? hasInk : tab === "type" ? typed.trim().length > 0 : !!uploadUrl;
  const adopt = () => {
    const at = new Date().toISOString();
    if (tab === "draw") {
      const dataUrl = canvasRef.current?.toDataURL("image/png") ?? "";
      onDone({ kind: "drawn", dataUrl, at });
    } else if (tab === "type") {
      onDone({ kind: "typed", text: typed.trim(), font: fontId, at });
    } else if (uploadUrl) {
      onDone({ kind: "uploaded", dataUrl: uploadUrl, at });
    }
  };

  return (
    <div className="nxEsOverlay" role="presentation" onClick={onCancel}>
      <div
        className="nxEsDialog"
        role="dialog"
        aria-modal="true"
        aria-label={kind === "initials" ? "Adopt your initials" : "Adopt your signature"}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      >
        <header className="nxEsDialogHead">
          <h2>{kind === "initials" ? "Adopt your initials" : "Adopt your signature"}</h2>
          <button type="button" className="nxEsIconBtn" aria-label="Close" onClick={onCancel}>×</button>
        </header>
        <div className="nxEsTabs" role="tablist" aria-label="Signature method">
          {(["draw", "type", "upload"] as Tab[]).map((t) => (
            <button
              key={t} type="button" role="tab" aria-selected={tab === t}
              className={tab === t ? "nxEsTab isActive" : "nxEsTab"}
              onClick={() => setTab(t)}
            >
              {t === "draw" ? "Draw" : t === "type" ? "Type" : "Upload"}
            </button>
          ))}
        </div>
        {tab === "draw" && (
          <div className="nxEsPad">
            <canvas
              ref={canvasRef}
              className="nxEsInkPad"
              data-testid="esign-ink-pad"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            <div className="nxEsPadRow">
              <span className="nxEsHint">Draw with your mouse or finger</span>
              <button type="button" className="nxEsBtn" onClick={clearInk} disabled={!hasInk}>Clear</button>
            </div>
          </div>
        )}
        {tab === "type" && (
          <div className="nxEsPad">
            <label className="nxEsFieldLabel" htmlFor="esign-typed">
              {kind === "initials" ? "Initials" : "Full name"}
            </label>
            <input
              id="esign-typed" className="nxEsInput" value={typed}
              onChange={(e) => setTyped(e.target.value)} autoFocus
            />
            <div className="nxEsFontRow" role="radiogroup" aria-label="Signature style">
              {FONTS.map((f) => (
                <button
                  key={f.id} type="button" role="radio" aria-checked={fontId === f.id}
                  className={fontId === f.id ? "nxEsFontCard isActive" : "nxEsFontCard"}
                  style={{ fontFamily: f.css }}
                  onClick={() => setFontId(f.id)}
                >
                  {typed.trim() || f.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === "upload" && (
          <div className="nxEsPad">
            <input type="file" accept="image/png,image/jpeg" onChange={pickFile} className="nxEsFile" />
            {uploadUrl ? (
              <div className="nxEsUploadPreview"><img src={uploadUrl} alt="Signature preview" /></div>
            ) : (
              <p className="nxEsHint">Upload a PNG or JPEG of your signature.</p>
            )}
          </div>
        )}
        <footer className="nxEsDialogFoot">
          <span className="nxEsLegal">
            By adopting, you agree this mark represents your signature in this demo flow.
          </span>
          <div className="nxEsBtnRow">
            <button type="button" className="nxEsBtn" onClick={onCancel}>Cancel</button>
            <button type="button" className="nxEsBtn isPrimary" disabled={!canAdopt} onClick={adopt} data-testid="esign-adopt">
              Adopt {kind === "initials" ? "initials" : "signature"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 3)
    .join("");
}
