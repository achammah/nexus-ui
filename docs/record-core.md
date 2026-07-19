# record-core — the config-driven record system

Tables, boards, and record pages render FROM an `ObjectConfig` — a new entity is a config row, never a forked surface. This is the layer shadcn does not have; it is `rebuilt` (clean-room, PROVENANCE.md) and composes the vendored kit underneath.

## The object model (`src/record-core/types.ts`)

```ts
interface ObjectConfig {
  key: string;            // "companies" — route + API segment
  label: string;          // "Companies" (plural)
  labelOne: string;       // "Company"
  icon?: string;          // lucide name (consumer maps it)
  fields: FieldDef[];
  stageField?: string;    // a select field's key → enables the kanban
  defaultView: "table" | "kanban";
}
interface FieldDef {
  key: string; label: string;
  type: "text" | "number" | "select" | "date" | "currency" | "email" | "url" | "relation";
  options?: string[];     // select: the stages/choices
  relation?: string;      // relation: target object key
  width?: number;         // table column px
  primary?: boolean;      // the display-name field (renders as the open-record link)
}
```

Field-type behaviors (all built-in): `select` renders as text-that-edits in tables (no per-row chrome) and a real select on record pages; `number`/`currency` format with grouping + right-align (tabular numerals); `relation` renders as an accent LINK that navigates to the target object's list, pre-filtered to the value (the consumer passes the pending filter via `sessionStorage["nx-pending-q"]` — see the starter's ObjectView).

## Components

| Component | Props (load-bearing) | Behavior |
|---|---|---|
| `DataTable` | `config, rows, onOpen(id), onPatch(id, patch), hiddenFields?, selection?, onSelectionChange?` | TanStack-powered grid: click-to-sort headers, primary-field link (`data-journey="open-<obj>"`), inline cell editing (text commit on blur/Enter; select on change; numbers formatted until focused), relation links, row checkboxes when `onSelectionChange` is passed, empty state; **auto-virtualizes past 80 rows** (windowed DOM via @tanstack/react-virtual, spacer rows, 70vh scroll container — journey-proven: 128 rows render <110 DOM rows while scroll reaches the last) |
| `KanbanBoard` | `config, rows, onPatch, onOpen` | columns from `stageField.options`; dnd-kit drag commits `{[stageField]: stage}`; card click opens; per-column counts; formatted meta |
| `RecordPage` | `config, row, timeline, onPatch, onBack, onAddNote` | header (name + stage badge + kind eyebrow) · left fields panel (inline edit per type; `date` fields open a calendar popover writing `yyyy-mm-dd`) · right Tabs: Timeline (rail + dots) / Notes (composer + list) |

`DataTable` sorting is optionally CONTROLLED (`sort` + `onSortChange`) so consumers persist it in their saved view; `hiddenFields` pairs with a consumer-owned column-visibility menu (the starter persists both per object in `nx-view-<obj>`). `date` cells render formatted (`14 Aug 2026`); editing dates lives on the record page.

Every interactive element carries a `data-testid` (`row-<id>`, `card-<id>`, `col-<stage>`, `field-<key>`, `record-name`, `record-stage`, `note-input`, `rel-<id>-<key>`) — journeys assert on these, never on CSS classes.

## Contracts the consumer honors
- **Optimistic patch + reload-on-error:** apply the patch locally, call the API, reload truth on failure (the starter's ObjectView/RecordView are the reference).
- **Stable callback identities** into these components (`useCallback`) — an inline arrow recreated per render spins refetch loops (measured; the starter fixed it once so you don't have to).
- **API responses are never browser-cached** (`no-store`) — a cached list re-renders moved cards in their old column (measured).

## Extending
A new surface family (calendar view, gallery, tree) lands HERE as a sibling module reading the same `ObjectConfig` — never as a one-off inside an app (ux-canon component-inventory rule). Add an OURS row in `scripts/gen-docs.mjs` + regenerate.
