#!/usr/bin/env node
/* Generate the component catalog — docs/INDEX.md (human) + docs/catalog.json (machine).
   Run after every vendor/wrapper change: the catalog is DERIVED from the live tree
   (.vendor-manifest.json + the source files), so it cannot rot. The WHEN one-liners
   are curated here — this dictionary IS the documentation surface agents grep. */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "src");
const DOCS = path.join(ROOT, "docs");
mkdirSync(DOCS, { recursive: true });

/* WHEN-to-use, per vendored component (curated; extend when vendoring new items). */
const WHEN = {
  accordion: "collapsible Q&A / grouped detail sections; one or many open",
  alert: "inline callout (info/destructive) inside a page — not a toast, not a dialog",
  "alert-dialog": "REVIEW SURFACE before an irreversible action (delete/send) — names the target, confirm/cancel; required before any bulk mutation",
  "aspect-ratio": "media/embed boxes that must keep a ratio while resizing",
  avatar: "person/org identity dot with image + initials fallback",
  badge: "status chip; prefer the primitives Badge wrapper for Nexus tones (ok/warn/danger/accent)",
  breadcrumb: "hierarchical location trail (Settings / Team / Member)",
  button: "every action; prefer the primitives Button wrapper (variant/size/busy/icon API)",
  calendar: "date picking (react-day-picker); pairs with popover for a date-picker field",
  card: "raised content container with header/footer slots; .nxCard is the lighter token twin",
  carousel: "horizontally swiped media/item strip (embla)",
  chart: "recharts wrapper bound to the token palette (--chart-1..5); dashboards + trend blocks",
  checkbox: "boolean field / row selection; wrapper Checkbox gives the simple checked/onChange API",
  collapsible: "show-more region without accordion semantics",
  command: "typeahead lists + the ⌘K palette (cmdk); the starter wires CommandPalette on it",
  "context-menu": "right-click menus on rows/cards",
  dialog: "modal for a focused task (create/edit form); wrapper Dialog gives title/footer API",
  drawer: "bottom sheet on mobile-ish flows (vaul)",
  "dropdown-menu": "kebab/row action menus; wrapper Menu gives trigger+items API",
  form: "react-hook-form + zod field wiring (FormField/FormItem/FormMessage) for validated forms",
  "hover-card": "rich preview on hover (person card over a mention)",
  input: "single-line text entry; wrapper Input adds invalid→aria-invalid",
  "input-otp": "segmented one-time-code entry",
  label: "accessible field labels tied to inputs",
  menubar: "app-level horizontal menu (File/Edit style)",
  "navigation-menu": "marketing/site-style top navigation with panels",
  pagination: "page-by-page navigation for long lists (record-core tables usually filter instead)",
  popover: "small anchored panel (filter builder, emoji picker); not a menu, not a dialog",
  progress: "determinate progress bar; pair with async-run surfaces",
  "radio-group": "single choice among few visible options",
  resizable: "split panes with draggable handles (react-resizable-panels)",
  "scroll-area": "styled scroll container for bounded internal scroll",
  select: "single choice among many options (composed listbox); raw <select class=nxInput> stays fine for tiny enum cells",
  separator: "hairline divider",
  sheet: "side panel over content (record peek, filters) — the ZOOM step without leaving the list",
  sidebar: "full app-shell sidebar system (collapsible groups, mobile behavior); the starter shell is a lighter hand-rolled twin — adopt this when an app outgrows it",
  skeleton: "loading placeholders shaped like the content",
  slider: "numeric range input",
  sonner: "toast system (Toaster + toast()); the starter ships its own minimal toast — pick ONE per app",
  switch: "on/off setting with immediate effect",
  table: "styled table primitives; record-core DataTable is the batteries-included grid on top",
  tabs: "in-page view switching; wrapper Tabs gives the {tabs,value,onValueChange} API",
  textarea: "multi-line text entry",
  toggle: "pressed/unpressed tool button",
  "toggle-group": "exclusive or multi toggle row (view switches)",
  tooltip: "hover hint; wrapper Tip gives label+child API",
  "use-mobile": "hook: viewport-below-768 boolean (sidebar dependency)",
  field: "labeled field scaffolding (Field/FieldGroup/FieldLabel…) used by newer blocks; form.tsx remains the react-hook-form wiring",
};

const BLOCK_WHEN = {
  "login-03": "copy-out starting screen: card login with provider slots — richer than the starter's built-in gate",
  "sidebar-07": "copy-out starting shell: collapsible sidebar app frame (breadcrumb header, icon rail) — adopt when an app outgrows the starter's hand-rolled shell",
};

const OURS = [
  ["primitives/Button.tsx", "wrapper", "Button", "the house button API (variant primary/secondary/ghost/danger · size sm/md · busy · icon) over vendored button"],
  ["primitives/fields.tsx", "wrapper", "Input · Badge · Micro · Tabs/TabPanel · Checkbox · Tip", "house APIs over vendored input/badge/tabs/checkbox/tooltip + the Micro eyebrow"],
  ["primitives/overlays.tsx", "wrapper", "Dialog · Menu", "house APIs over vendored dialog/dropdown-menu (title+footer / trigger+items)"],
  ["primitives/SettingsTabs.tsx", "wrapper", "SettingsTabs", "generic settings shell: sticky tab bar (tabs-as-config: key/label/icon/render) + body, own active-tab state — page head stays app content"],
  ["primitives/EditableRuleList.tsx", "wrapper", "EditableRuleList", "config-driven editable rule/policy list: inline add/edit card, optional severity chip (enum+colors as props) and active toggle, over any object — no fetch inside, onCreate/onPatch/onRemove callback contract like DataTable"],
  ["primitives/ThinkingDots.tsx", "wrapper", "ThinkingDots", "the 'AI is working' indicator (three bouncing accent dots); tokenized + reduced-motion aware — drop in beside any agent/task-run affordance"],
  ["record-core/DataTable.tsx", "record-core", "DataTable", "config-driven grid: sort, selection, inline edit, relation link cells, numeric alignment — see docs/record-core.md"],
  ["record-core/KanbanBoard.tsx", "record-core", "KanbanBoard", "config-driven board over the object's stageField; drag or stage-select moves cards"],
  ["record-core/RecordPage.tsx", "record-core", "RecordPage", "record anatomy: header + fields panel (inline edit, enrich affordance) + Timeline (activity composer, per-kind icons) / Notes / Files tabs"],
  ["record-core/ChartView.tsx", "record-core", "ChartView", "config-driven chart: one bar per group option, Count or Σ numeric measure — the third view family beside table/board"],
  ["record-core/types.ts", "record-core", "ObjectConfig · FieldDef · RecordRow · ViewDef · TimelineEvent · FileMeta", "the config-driven object model — the schema every record surface renders from"],
  ["skins/skin.ts", "skins", "Skin · skinToCss() · applySkin()", "brand-as-data: a small JSON in, the full --nx-* set out (accent ramp, chrome, radius, fonts, labels, density, shadows, dark derivation, raw overrides) — see docs/THEMING.md"],
  ["skins/presets.ts", "skins", "skinPresets (nexus · ember · warm-opt)", "built-in skins: the house identity, a full-range org example (dark chrome, sharp corners, own palette/type), and a warm option-chip palette preset (skin-overridable; default palette unchanged)"],
  ["tokens/tokens.css", "tokens", "--nx-* custom properties", "the blank canvas: palette/type/geometry/motion + chrome/label tokens; light+dark first-class; skins WRITE this at runtime, an app's design lock edits it statically"],
  ["tokens/motion.css", "tokens", "nx motion utilities", "riseIn/popIn entrance families + .nx-tap-scale/.nx-hover-lift micro-interactions, tokenized on the ease vars; ONE reduced-motion guard (opt back in with data-motion=\"always\")"],
  ["styles/shadcn.css", "tokens", "shadcn semantic bridge", "maps shadcn variables onto --nx-* + Tailwind v4 @theme; import AFTER tokens.css"],
  ["hooks/usePollRev.ts", "hook", "usePollRev", "live-sync: poll a revision counter, fire onChange when another writer bumped it (transport-agnostic fetchRev; pauses while the tab is hidden)"],
  ["hooks/useAsyncOp.ts", "hook", "useAsyncOp · computeAsyncOp", "drive a long off-machine op with a stall guard: poll while in-flight, onSettle once, stalled past a threshold (injectable clock)"],
  ["hooks/useDebouncedSave.ts", "hook", "useDebouncedSave · createDebouncer", "debounced autosave: coalesce rapid edits into ONE persist + a saveState (idle→saving→saved)"],
  ["lib/utils.ts", "lib", "cn()", "class merge (clsx + tailwind-merge) — the shadcn contract"],
];

const manifest = JSON.parse(readFileSync(path.join(SRC, "components", "ui", ".vendor-manifest.json"), "utf8"));
const items = [];

for (const [name, meta] of Object.entries(manifest.components).sort()) {
  items.push({
    name,
    kind: name.startsWith("use-") ? "vendored-hook" : "vendored",
    import: meta.files.map((f) => "src/" + f).join(" · "),
    when: WHEN[name] ?? "(add a WHEN line in scripts/gen-docs.mjs)",
    source: `shadcn/ui ${manifest.style} (MIT — NOTICE.md)`,
  });
}
for (const [name, meta] of Object.entries(manifest.blocks ?? {}).sort()) {
  items.push({
    name,
    kind: "block",
    import: meta.files.map((f) => "src/" + f).join(" · "),
    when: BLOCK_WHEN[name] ?? "(add a BLOCK_WHEN line in scripts/gen-docs.mjs)",
    source: `shadcn/ui ${manifest.style} block (MIT — NOTICE.md); copy-out example tissue, not a runtime import`,
  });
}
for (const [file, kind, exports_, when] of OURS) {
  if (!existsSync(path.join(SRC, file))) continue;
  items.push({ name: exports_, kind, import: "src/" + file, when, source: kind === "record-core" ? "ours (rebuilt — PROVENANCE.md)" : "ours" });
}

const missing = items.filter((i) => i.when.startsWith("(add"));
if (missing.length) console.error("WHEN lines missing:", missing.map((m) => m.name).join(", "));

/* machine catalog — DETERMINISTIC output (stamped from the vendor manifest, never
   `now`): CI regenerates and diffs, so any nondeterminism would fail every run. */
writeFileSync(path.join(DOCS, "catalog.json"), JSON.stringify({ vendoredAt: manifest.fetchedAt, style: manifest.style, count: items.length, items }, null, 2) + "\n");

/* human/agent INDEX */
const rows = items
  .map((i) => `| ${i.name} | ${i.kind} | \`${i.import}\` | ${i.when} |`)
  .join("\n");
writeFileSync(
  path.join(DOCS, "INDEX.md"),
  `# nexus-ui — component catalog

GENERATED by \`node scripts/gen-docs.mjs\` (vendor set of ${String(manifest.fetchedAt).slice(0, 10)}) from the live tree — edit the WHEN dictionary in the script, never this file. Machine-readable twin: \`docs/catalog.json\`. Deep docs: \`docs/record-core.md\` (the config-driven record system) · \`AGENTS.md\` (how an agent works in this repo).

${items.length} entries: ${Object.keys(manifest.components).length} vendored shadcn items + wrappers + record-core + tokens.

| Component | Kind | Import | When to use |
|---|---|---|---|
${rows}

## Rules of the road
- **Never edit \`src/components/ui/*\`** — vendored verbatim; re-vendoring overwrites. House opinions live in \`src/primitives/\` wrappers.
- Styling changes go through **tokens** (\`src/tokens/tokens.css\`) — the shadcn bridge derives from them; a design lock restyles the whole kit by editing tokens only.
- A control missing here is added to THIS library (extend \`scripts/vendor-shadcn.mjs\` COMPONENTS or write a wrapper), never hand-built in one app.
`,
);
console.log(`catalog: ${items.length} entries → docs/INDEX.md + docs/catalog.json${missing.length ? " (WITH GAPS)" : ""}`);
