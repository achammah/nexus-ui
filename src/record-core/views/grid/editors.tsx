import * as React from "react";
import { GridCellKind, type GridCell, type ProvideEditorCallback } from "@glideapps/glide-data-grid";

/* Replacement overlay editors for glide's BUILT-IN text/uri/number cells. Under
   React 18 StrictMode the library's overlay tempValue/keydown chain drops the
   commit (the overlay closes with an undefined value and the edit silently
   vanishes), while an editor calling its own onFinishedEditing prop commits
   reliably (the custom select/multiselect/user editors prove the path). These
   are ordinary controlled inputs that keep onChange updated for click-outside
   commits AND commit directly on Enter/Tab; Escape cancels. */

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: 0,
  outline: "none",
  background: "transparent",
  color: "var(--nx-fg)",
  font: "inherit",
  padding: "6px 8px",
  resize: "none",
};

type EditorProps<T extends GridCell> = {
  readonly value: T;
  readonly onChange: (newValue: T) => void;
  readonly onFinishedEditing: (newValue?: T, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
};

/* Enter commits + moves down · Tab commits + moves right · Escape cancels ·
   blur (click-away) commits in place — the spreadsheet advance + the
   commit-on-blur idiom the DOM table uses. The `done` ref stops the unmount
   blur from double-committing after a key already resolved the edit. */
function useCommitHandlers<T extends GridCell>(p: EditorProps<T>, current: () => T) {
  const done = React.useRef(false);
  const finish = (value: T | undefined, movement: readonly [-1 | 0 | 1, -1 | 0 | 1]) => {
    if (done.current) return;
    done.current = true;
    p.onFinishedEditing(value, movement);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      finish(current(), [0, 1]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      finish(current(), [e.shiftKey ? -1 : 1, 0]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      finish(undefined, [0, 0]);
    }
  };
  const onBlur = () => finish(current(), [0, 0]);
  return { onKeyDown, onBlur };
}

/* local state is the commit source — never the p.value round-trip (the
   round-trip is the very chain that drops under StrictMode) */
function TextEditor(p: EditorProps<Extract<GridCell, { kind: GridCellKind.Text }>>) {
  const [text, setText] = React.useState(p.value.data);
  const h = useCommitHandlers(p, () => ({ ...p.value, data: text }));
  return (
    <textarea
      style={{ ...inputStyle, minHeight: 34 }}
      autoFocus
      rows={1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        p.onChange({ ...p.value, data: e.target.value });
      }}
      onKeyDown={h.onKeyDown}
      onBlur={h.onBlur}
    />
  );
}

function UriEditor(p: EditorProps<Extract<GridCell, { kind: GridCellKind.Uri }>>) {
  const [text, setText] = React.useState(p.value.data);
  const h = useCommitHandlers(p, () => ({ ...p.value, data: text }));
  return (
    <input
      style={inputStyle}
      autoFocus
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        p.onChange({ ...p.value, data: e.target.value });
      }}
      onKeyDown={h.onKeyDown}
      onBlur={h.onBlur}
    />
  );
}

function NumberEditor(p: EditorProps<Extract<GridCell, { kind: GridCellKind.Number }>>) {
  const [raw, setRaw] = React.useState(p.value.data === undefined ? "" : String(p.value.data));
  const h = useCommitHandlers(p, () => {
    const n = Number(raw.replaceAll(",", ""));
    return { ...p.value, data: raw.trim() === "" || !Number.isFinite(n) ? undefined : n, displayData: raw };
  });
  return (
    <input
      style={inputStyle}
      autoFocus
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const t = e.target.value;
        setRaw(t);
        const n = Number(t.replaceAll(",", ""));
        p.onChange({ ...p.value, data: t.trim() === "" || !Number.isFinite(n) ? undefined : n, displayData: t });
      }}
      onKeyDown={h.onKeyDown}
      onBlur={h.onBlur}
    />
  );
}

export const provideGridEditor: ProvideEditorCallback<GridCell> = (cell) => {
  if (cell.kind === GridCellKind.Text) return { editor: TextEditor as never };
  if (cell.kind === GridCellKind.Uri) return { editor: UriEditor as never };
  if (cell.kind === GridCellKind.Number) return { editor: NumberEditor as never };
  return undefined;
};
