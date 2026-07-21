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
  type: "text" | "number" | "select" | "date" | "currency" | "email" | "url"
      | "relation" | "user" | "multiselect"
      | "boolean" | "longText" | "dateTime" | "rating" | "array" | "json"
      | "money" | "emails" | "phones" | "links" | "address" | "fullName"
      | "richText" | "whiteboard";
  options?: SelectOption[]; // select | multiselect — a string, or {value, label?, color?}
                            // (colors: gray/blue/green/yellow/orange/red/purple/pink/teal —
                            // chips render the color on every surface via OptionChip)
  unique?: boolean;         // 409 on duplicate values (server-enforced)
  isActive?: boolean;       // false → hidden from every surface + write-protected, data preserved
  scale?: number;           // rating scale (default 5)
  relation?: string;      // relation: target object key
  multiple?: boolean;     // relation holds MANY targets (value: id[]) — checkbox picker, ONE commit on close
  relationTargets?: string[]; // POLYMORPHIC relation (value: {object,id}) — replaces `relation`
  inverseLabel?: string;  // names the reverse related-list section on the target
  width?: number;         // table column px
  primary?: boolean;      // the display-name field (renders as the open-record link)
  primitive?: {           // AI-enrichment seam: the platform primitive computing this field
    kind: "task" | "workflow"; id?: string; label?: string;
  };
}
```

Field-type behaviors (all built-in): `select` renders as text-that-edits in tables (no per-row chrome) and a real select on record pages; `number`/`currency` format with grouping + right-align (tabular numerals); `relation` renders as an accent LINK that navigates to the target object's list, pre-filtered to the value (the consumer passes the pending filter via `sessionStorage["nx-pending-q"]` — see the starter's ObjectView); `user` renders an avatar-initials chip in tables and a directory combobox (over the consumer's `users` list) on record pages; `multiselect` renders tag chips (+N overflow) in tables and a checkbox popover on record pages, filtering contains-any; `boolean` is an inline checkbox everywhere; `rating` renders clickable stars (click the current value to clear); `dateTime` edits via a datetime-local input on the record page; `array` is free-form tags (no fixed vocabulary — type + Enter adds); `longText` truncates in tables and edits as a textarea; `json` is a validated raw editor; a select whose options carry colors renders as a COLORED CHIP in tables with an invisible native select on top (chip look, dropdown behavior).

Shaped (composite) types carry structured values and edit on the record page as grouped editors saving ONE patch: `money` holds `{ amount: number, code: string }` (ISO 4217) — cells render Intl currency (`€12,500`), right-aligned, and the field is MEASURABLE: chart measures and kanban rollups sum its `amount` (`isMeasurable`/`measurableValue` in `types.ts`); the editor is an amount + 3-letter-code pair (code stored uppercase). `emails`/`phones`/`links` hold `string[]` — cells show the first entry as a chip plus a `+N` overflow (links render as anchors labeled with the bare host, opening a new tab); the record-page list editor adds on Enter, removes per row, and validates per entry (email format, URL-or-domain, lenient phone), surfacing an inline error that names the field (`field-<key>-err`). `address` holds `{ street?, city?, postcode?, country? }` — cells one-line `street, city`; the editor is an inline group of four labeled inputs. `fullName` holds `{ first?, last? }` — cells render `First Last`; a `fullName` field may be `primary`, and every primary surface (table link, record title, kanban card + drag overlay) renders the joined name via `formatCell`. `currency` (a bare number) stays untouched — `money` is the shaped alternative. Consumers flatten shaped values for CSV with `csvCell` (money → `amount code`, lists → `a; b`, address/fullName → joined text).

## Components

| Component | Props (load-bearing) | Behavior |
|---|---|---|
| `DataTable` | `config, rows, onOpen(id), onPatch(id, patch), hiddenFields?, selection?, onSelectionChange?` | TanStack-powered grid: click-to-sort headers, primary-field link (`data-journey="open-<obj>"`), inline cell editing (text commit on blur/Enter; select on change; numbers formatted until focused), relation links, row checkboxes when `onSelectionChange` is passed, empty state; **auto-virtualizes past 80 rows** (windowed DOM via @tanstack/react-virtual, spacer rows, 70vh scroll container — journey-proven: 128 rows render <110 DOM rows while scroll reaches the last) |
| `KanbanBoard` | `config, rows, onPatch, onOpen, groupField?, groupOptions?` | columns from the group field's options (`groupField` defaults to `stageField` — pass any select/user field key to regroup; `user` fields need `groupOptions` = the app's directory since their columns aren't in `FieldDef.options`); dnd-kit drag commits `{[groupField]: column}`; card click opens; per-column counts; formatted meta |
| `ChartView` | `config, rows, groupField?, groupOptions?, measure?` | one bar per group option (same group semantics as the board: any select/user field, `groupOptions` supplies user columns); `measure` is `"count"` or a number/currency field key to SUM per group; value labels, hover emphasis, horizontal scroll past ~8 groups |
| `RecordPage` | `config, row, timeline, onPatch, onBack, onAddNote, relationOptions?, onOpenRelation?, related?, userOptions?, files?, onLogActivity?, onEnrich?` | header (name + stage badge + kind eyebrow) · left fields panel (inline edit per type; `date` → calendar popover writing `yyyy-mm-dd`; `user` → directory combobox; `multiselect` → chips + checkbox popover; a field with `primitive` + `onEnrich` shows a sparkle Run affordance) · right Tabs: Timeline (per-kind icons; optional call/email/meeting composer when `onLogActivity` is passed) / Notes / Files (upload + list + download when `files` is passed) |

`DataTable` ships the keyboard grid: three focus levels (row → cell → editing) with vim alternates (j/k), `x` selection, Cmd/Ctrl+A, type-to-edit (the keystroke seeds the editor), Enter save-and-advance-down, Tab lateral, a laddered Escape, and `onPeek` for Cmd/Ctrl+Enter. Editability follows the cell renderer structurally: any type the generic inline input renders is keyboard-editable; special-cased types (select/boolean/rating/relation/user/date/… and the shaped types money/emails/phones/links/address/fullName) get type-appropriate keys (Enter toggles booleans, digits set ratings, Enter focuses selects). Backspace clears a shaped cell to its empty form — lists to `[]`, money/address/fullName to `null`. Focus states surface as `tr[data-row-focus]` / `td[data-cell-focus]`.

`RecordPage`'s `RelationPicker` accepts `onCreate(title)` — when a search has no match it offers a "Create …" row (`field-<key>-create`) plus Enter-to-create, for born-with-a-title + attach flows.

**Relations are identity-linked: rows store target IDS, reads project LABELS.** The consumer's API decorates each row with `_refs` (raw ids per relation field: id · id[] · `{object,id}`) while the field itself carries the projected label — `rowRefs(row)` reads the decoration. Pickers run in **items mode** by passing `relationItems: Record<fieldKey, RelationItem[]>` (`{id, label, type?, typeLabel?}` — build labels from the target's primary via `formatCell`, so fullName-primary targets list joined); a pick patches the ID (`{object,id}` for polymorphic fields), never the label. Option rows keep their historical label-slug testids and add `data-rel-id` for same-labeled disambiguation; when a poly picker's items span more than one type, each row grows a type tag (`rel-type-<object>`). A `multiple` relation renders attached chips (grouped per type for poly fields, `field-<key>-group-<type>`) with per-chip detach, and its checkbox picker holds a LOCAL pending set — the accumulated diff commits as ONE patch when the dropdown closes, never a write per click. Writes to the consumer's store may also be plain label strings: unique → normalized to the id, ambiguous → 400, unmatched → kept verbatim as a dangling label (renders as-is, carries no ref). Renames need no sweep — labels re-project from the id on every read.

`DataTable` sorting is optionally CONTROLLED (`sort` + `onSortChange`) so consumers persist it in their saved view; `hiddenFields` pairs with a consumer-owned column-visibility menu (the starter persists both per object in `nx-view-<obj>`). `date` cells render formatted (`14 Aug 2026`); editing dates lives on the record page.

`RecordPage` relation fields render a **picker** (command combobox over `relationOptions[fieldKey]` — the target object's primary values, consumer-fetched) with an optional jump button (`onOpenRelation`); pass `related: RelatedList[]` to render **related lists** (the reverse side of relations — the starter derives them from config: every object pointing at this one, filtered to this record). This pair is what makes an ATS/CRM-class app read as one.

`RecordPage`'s optional blocks all follow the same pattern — pass the prop to enable, omit it and the UI disappears: `watch: { on, count, onToggle }` renders the eye Watch button; `pin: { on, onToggle }` renders a star Favorite button (`data-testid="fav-toggle"`) — presentation only, the host owns storage (the starter keeps pins in localStorage and renders a sidebar shelf from them); `files: { list: FileMeta[], onUpload({name,mime,data}), downloadHref(fileId) }` adds the Files tab (base64 upload via a hidden input, list with size/date, download links); `onLogActivity(kind, text)` adds the segmented call/email/meeting composer to the Timeline tab (events carry `kind:"activity"` + `activity` subkind → per-kind icons); `onEnrich(fieldKey)` arms the sparkle on `primitive`-carrying fields (the consumer owns the actual platform call — the starter ships a labeled mock endpoint as the swap-point).

Every interactive element carries a `data-testid` (`row-<id>`, `card-<id>`, `col-<stage>`, `field-<key>`, `record-name`, `record-stage`, `fav-toggle`, `note-input`, `rel-<id>-<key>`, `group-by-<key>`, `file-input`, `file-row-<id>`, `file-dl-<id>`, `act-kind-<kind>`, `act-input`, `act-log`, `enrich-<key>`, `tl-ic-<kind>`, `chart-<obj>`, `bar-<option>` with `data-value`) — journeys assert on these, never on CSS classes.

## The field-type registry (`src/record-core/fields/`)

Field types are self-registering, the field twin of the view registry: `fields/registry.ts` discovers every `fields/<type>/definition.{ts,tsx}` at build time (`import.meta.glob`), and the hosts — RecordPage's field editor, DataTable's cells + `formatCell`/`csvCell` + keyboard grid, KanbanBoard's card meta, `filterableFields` — consult it BEFORE their built-in switches. A `FieldTypeDefinition` (see `fields/types.ts`) fills only the slots it owns: `render` (record-page surface, `React.lazy` for heavy editors; the host Suspense-wraps with a designed loading state), `cell` (read-only list cell), `previewText` (one-line text), `layout: "block"` (full-width record-page breakout, both layouts), `filterable`/`keyboardEditable`/`clearValue` capabilities, and the editor-side `Draft`/`coerce`/`validate` slots. The pure fold + capability helpers live in `fields/resolve.ts` (node-testable, no vite).

The first registered type is `whiteboard` (`fields/whiteboard/`): a per-record excalidraw canvas persisted as plain scene JSON (`{ elements }` — elements only; mounts scroll to content, a stored `appState` is tolerated and ignored) through ONE debounced store patch — `getSceneVersion` gates saves so viewport moves never write; the Saving…/Saved chip announces via `role="status"`. Cells render a memoized SVG thumbnail (`exportToSvg` behind a dynamic import, cached by scene content + theme, re-derived on a live dark-flip; empty scenes render a static glyph and import nothing). On mobile the field rests as a preview + "Edit canvas" tap that opens a fullscreen overlay editor; the record-page canvas follows the app theme via the `data-theme` attribute on `<html>`. The image tool and file-system canvas actions are disabled — scenes stay lean JSON.

## Contracts the consumer honors
- **Optimistic patch + reload-on-error:** apply the patch locally, call the API, reload truth on failure (the starter's ObjectView/RecordView are the reference).
- **Stable callback identities** into these components (`useCallback`) — an inline arrow recreated per render spins refetch loops (measured; the starter fixed it once so you don't have to).
- **API responses are never browser-cached** (`no-store`) — a cached list re-renders moved cards in their old column (measured).

## Extending
A new surface family (calendar view, gallery, tree) lands HERE as a sibling module reading the same `ObjectConfig` — never as a one-off inside an app. Add an OURS row in `scripts/gen-docs.mjs` + regenerate.
