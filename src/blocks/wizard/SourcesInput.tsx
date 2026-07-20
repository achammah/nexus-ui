import * as React from "react";
import { FileText, Link2, Plus, Upload, X } from "lucide-react";
import type { Sources } from "./types";

const DEFAULT_ACCEPT = [".txt", ".md", ".markdown", ".csv", ".json"];
const DEFAULT_MAX_CHARS = 20000;
const defaultReadFile = (f: File) => f.text().catch(() => "");

/* SourcesInput — a standalone URL-list + click-upload field (Sources = {urls, docs}).
   Zero coupling to Wizard. `accept`/`maxCharsPerDoc` are props, not baked in; `readFile`
   lets a caller swap the reader (e.g. a PDF extractor) instead of the default f.text(). */

export function SourcesInput({
  urls,
  docs,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxCharsPerDoc = DEFAULT_MAX_CHARS,
  readFile = defaultReadFile,
  testIdPrefix = "src",
}: {
  urls: string[];
  docs: Sources["docs"];
  onChange: (v: Sources) => void;
  accept?: string[];
  maxCharsPerDoc?: number;
  readFile?: (f: File) => Promise<string>;
  testIdPrefix?: string;
}) {
  const [url, setUrl] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const addUrl = () => {
    const t = url.trim();
    if (t && !urls.includes(t)) onChange({ urls: [...urls, t], docs });
    setUrl("");
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: Sources["docs"] = [];
    for (const f of Array.from(files)) {
      const text = await readFile(f);
      added.push({ name: f.name, text: text.slice(0, maxCharsPerDoc) });
    }
    onChange({ urls, docs: [...docs, ...added] });
  };

  return (
    <div className="nxwiz-sources">
      <div className="nxwiz-srcblock">
        <div className="nxwiz-srclabel">
          <Link2 size={13} /> Links
        </div>
        <div className="nxwiz-addrow">
          <input
            className="nxwiz-input"
            data-testid={`${testIdPrefix}-url`}
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
          />
          <button className="nxwiz-addbtn" data-testid={`${testIdPrefix}-url-add`} onClick={addUrl}>
            <Plus size={15} />
          </button>
        </div>
        <div className="nxwiz-srclist">
          {urls.map((u) => (
            <span key={u} className="nxwiz-srcitem">
              <Link2 size={12} />
              <span className="nxwiz-srcname">{u}</span>
              <button aria-label="Remove" onClick={() => onChange({ urls: urls.filter((x) => x !== u), docs })}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="nxwiz-srcblock">
        <div className="nxwiz-srclabel">
          <FileText size={13} /> Documents
        </div>
        <button className="nxwiz-srcdrop" data-testid={`${testIdPrefix}-upload`} onClick={() => fileRef.current?.click()}>
          <Upload size={18} />
          <span>Click to upload</span>
          <span className="nxwiz-srcdrophint">{accept.join(", ")}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={accept.join(",")}
          data-testid={`${testIdPrefix}-file`}
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />
        <div className="nxwiz-srclist">
          {docs.map((d, i) => (
            <span key={i} className="nxwiz-srcitem">
              <FileText size={12} />
              <span className="nxwiz-srcname">{d.name}</span>
              <span className="nxwiz-srcsize">{(d.text.length / 1000).toFixed(1)}k</span>
              <button aria-label="Remove" onClick={() => onChange({ urls, docs: docs.filter((_, j) => j !== i) })}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
