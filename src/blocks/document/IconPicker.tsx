import * as React from "react";
import { Search, Shuffle, Trash2, Upload, X, Image as ImageIcon } from "lucide-react";
import { EMOJI_GROUPS, EMOJI_ALL, searchEmoji } from "./emoji-data";
import { fileToIconDataUri, isImageIcon } from "../../record-core/PageIcon";

/* IconPicker — the page-icon menu (Notion's "click the icon" popover).

   Emoji tab: a searchable grid over the BUNDLED Unicode set (no vendor sprite sheet, no
   external host — strict-CSP safe), category jump strip, a recents row, Random and Remove.
   Upload tab: any image file becomes a square 128px data-URI icon that persists with the
   page like an emoji does.

   Presentation only — the host owns the page and applies `onPick`. */

const RECENTS_KEY = "nx.doc.iconRecents";
const RECENTS_MAX = 18;

function readRecents(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, RECENTS_MAX) : []; }
  catch { return []; }
}
function pushRecent(icon: string) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify([icon, ...readRecents().filter((r) => r !== icon)].slice(0, RECENTS_MAX))); }
  catch { /* storage unavailable — recents are a convenience, never a requirement */ }
}

export interface IconPickerProps {
  value?: string;
  onPick: (icon: string) => void;
  onRemove: () => void;
  onClose: () => void;
  /* rendered as a bottom sheet instead of a popover (touch layout) */
  sheet?: boolean;
}

export function IconPicker({ value, onPick, onRemove, onClose, sheet }: IconPickerProps) {
  const [tab, setTab] = React.useState<"emoji" | "upload">("emoji");
  const [q, setQ] = React.useState("");
  const [recents, setRecents] = React.useState<string[]>(readRecents);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const take = (icon: string) => { pushRecent(icon); setRecents(readRecents()); onPick(icon); };

  // dismiss on outside click / Escape
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const results = React.useMemo(() => (q.trim() ? searchEmoji(q) : null), [q]);

  const jumpTo = (key: string) => {
    const el = scrollRef.current?.querySelector(`[data-group="${key}"]`) as HTMLElement | null;
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
  };

  const random = () => { const e = EMOJI_ALL[Math.floor(Math.random() * EMOJI_ALL.length)]; take(e[0]); };

  const upload = async (file?: File) => {
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) { setErr("Pick an image file (PNG, JPG, GIF, SVG, WebP)."); return; }
    setBusy(true);
    try { take(await fileToIconDataUri(file)); }
    catch (e) { setErr(e instanceof Error ? e.message : "That image could not be read."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <div className={`nxIconPick${sheet ? " is-sheet" : ""}`} ref={rootRef} data-testid="icon-picker"
      role="dialog" aria-label="Page icon" onMouseDown={(e) => e.stopPropagation()}>
      <div className="nxIconPick-head">
        <div className="nxIconPick-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "emoji"} className={tab === "emoji" ? "is-on" : ""} data-testid="icon-tab-emoji" onClick={() => setTab("emoji")}>Emoji</button>
          <button role="tab" aria-selected={tab === "upload"} className={tab === "upload" ? "is-on" : ""} data-testid="icon-tab-upload" onClick={() => setTab("upload")}>Upload</button>
        </div>
        <div className="nxIconPick-acts">
          <button title="Random icon" data-testid="icon-random" onClick={random}><Shuffle size={14} /><span>Random</span></button>
          <button title="Remove icon" data-testid="icon-remove" disabled={!value} onClick={() => { onRemove(); onClose(); }}><Trash2 size={14} /><span>Remove</span></button>
          <button className="nxIconPick-x" title="Close" data-testid="icon-close" onClick={onClose}><X size={15} /></button>
        </div>
      </div>

      {tab === "emoji" ? (
        <>
          <div className="nxIconPick-search">
            <Search size={14} />
            <input autoFocus={!sheet} placeholder="Search emoji…" value={q} data-testid="icon-search"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { const r = results?.[0]; if (r) take(r[0]); } }} />
            {q && <button className="nxIconPick-clear" onClick={() => setQ("")} title="Clear"><X size={13} /></button>}
          </div>

          {!results && (
            <div className="nxIconPick-strip" data-testid="icon-categories">
              {EMOJI_GROUPS.map((g) => (
                <button key={g.key} data-testid={`icon-cat-${g.key}`} onClick={() => jumpTo(g.key)} title={g.label}>
                  <span aria-hidden>{g.emoji[0]?.[0]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="nxIconPick-scroll" ref={scrollRef} data-testid="icon-grid">
            {results ? (
              results.length ? (
                <div className="nxIconPick-grid">
                  {results.map(([c, n]) => (
                    <button key={c} title={n} data-testid={`emoji-${c}`} onClick={() => take(c)}>{c}</button>
                  ))}
                </div>
              ) : <div className="nxIconPick-empty">No emoji match “{q}”.</div>
            ) : (
              <>
                {recents.length > 0 && (
                  <section>
                    <h4>Recent</h4>
                    <div className="nxIconPick-grid" data-testid="icon-recents">
                      {recents.map((c) => (
                        <button key={c} title="Recent" data-testid={`recent-${c}`} onClick={() => take(c)}>
                          {isImageIcon(c) ? <img src={c} alt="" /> : c}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {EMOJI_GROUPS.map((g) => (
                  <section key={g.key} data-group={g.key}>
                    <h4>{g.label}</h4>
                    <div className="nxIconPick-grid">
                      {g.emoji.map(([c, n]) => (
                        <button key={c} title={n} data-testid={`emoji-${c}`} onClick={() => take(c)}>{c}</button>
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="nxIconPick-upload"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files?.[0]); }}>
          <button className="nxIconPick-drop" data-testid="icon-upload-open" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImageIcon size={22} />
            <b>{busy ? "Preparing…" : "Upload an image"}</b>
            <span>Drop a file here, or click to choose. It is cropped to a square and stored with the page.</span>
          </button>
          {value && isImageIcon(value) && (
            <div className="nxIconPick-current"><img src={value} alt="Current icon" /><span>Current custom icon</span></div>
          )}
          {err && <div className="nxIconPick-err" data-testid="icon-upload-error">{err}</div>}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} data-testid="icon-upload-input"
            onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}

export default IconPicker;
