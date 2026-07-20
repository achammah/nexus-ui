import * as React from "react";
import { Plus, X } from "lucide-react";

/* ChipListInput — a standalone composable-list field: type + Enter (or the + button)
   adds a chip, × removes it, optional suggestion chips add on click. Zero coupling to
   Wizard — usable anywhere a string[] needs editing. */

export function ChipListInput({
  value,
  onChange,
  placeholder,
  suggestions,
  testIdPrefix = "chip",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  testIdPrefix?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  const unused = (suggestions ?? []).filter((s) => !value.includes(s));

  return (
    <div className="nxwiz-list">
      <div className="nxwiz-chips">
        {value.map((c) => (
          <span key={c} className="nxwiz-listchip">
            {c}
            <button aria-label="Remove" onClick={() => onChange(value.filter((x) => x !== c))}>
              <X size={12} />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="nxwiz-listempty">Nothing added yet.</span>}
      </div>
      <div className="nxwiz-addrow">
        <input
          className="nxwiz-input"
          data-testid={`${testIdPrefix}-input`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <button className="nxwiz-addbtn" data-testid={`${testIdPrefix}-add`} onClick={() => add(draft)}>
          <Plus size={15} />
        </button>
      </div>
      {unused.length > 0 && (
        <div className="nxwiz-suggest">
          {unused.map((s) => (
            <button key={s} className="nxwiz-sugchip" data-testid={`${testIdPrefix}-suggest-${s}`} onClick={() => add(s)}>
              <Plus size={11} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
