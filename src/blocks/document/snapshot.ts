import { bid, type Block } from "../../record-core/NotionEditor";
import type { Suggestion } from "../../record-core/useSuggestions";

/* A free-surface DOCUMENT persists as ONE snapshot: the block array plus page chrome
   (title, optional icon/cover, page width). Mirrors the workbook block's snapshot shape so
   the Pages primitive can host a `kind:"document"` page with near-zero wiring — the host
   owns load/persist through its app store, the surface owns the editing. */
export interface DocumentSnapshot {
  id: string;
  title: string;
  blocks: Block[];
  icon?: string;              // a title emoji
  cover?: string;             // a preset key ("preset:dawn") or a data: URI image
  coverY?: number;            // vertical focal point (0–100%) for an uploaded image cover
  pageWidth?: "narrow" | "wide";
  version?: number;
  /* tracked changes (Word×Notion "suggesting" mode) — persisted alongside the document so a
     review survives a reload; the accepted text lives in `blocks`, the review state here. */
  suggestions?: Suggestion[];
}

export const DOCUMENT_STORE_PREFIX = "document:";
export const documentStoreKey = (pageKey: string): string => `${DOCUMENT_STORE_PREFIX}${pageKey}`;

/* A stored value is a usable document only if it carries the minimal shape; anything else
   recovers to a fresh document rather than crashing the surface. */
export function isDocumentSnapshot(x: unknown): x is DocumentSnapshot {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return typeof d.id === "string" && typeof d.title === "string" && Array.isArray(d.blocks);
}

/* The bundled cover set — gradients and flat colours, all pure CSS. Concrete values (not
   tokens) so an exported or standalone page renders identically, and NOTHING is fetched:
   a cover is either one of these or an image the user uploaded as a data URI. There is no
   stock-photo provider here on purpose (a keyed vendor and an external image host are both
   ruled out by the strict CSP). */
export const COVER_PRESETS: Record<string, string> = {
  "preset:dawn": "linear-gradient(120deg,#fda4af,#fdba74,#fcd34d)",
  "preset:dusk": "linear-gradient(120deg,#6366f1,#8b5cf6,#ec4899)",
  "preset:sea": "linear-gradient(120deg,#22d3ee,#3b82f6,#6366f1)",
  "preset:forest": "linear-gradient(120deg,#34d399,#10b981,#0d9488)",
  "preset:slate": "linear-gradient(120deg,#334155,#475569,#64748b)",
  "preset:ember": "linear-gradient(120deg,#f97316,#ef4444,#b91c1c)",
  "preset:mint": "linear-gradient(120deg,#a7f3d0,#6ee7b7,#5eead4)",
  "preset:violet": "linear-gradient(120deg,#c4b5fd,#a78bfa,#7c3aed)",
  "preset:sand": "linear-gradient(120deg,#fef3c7,#fde68a,#d6d3d1)",
  "preset:night": "linear-gradient(120deg,#0f172a,#1e293b,#334155)",
  "preset:aurora": "linear-gradient(120deg,#22d3ee,#a78bfa,#f472b6,#facc15)",
  "preset:paper": "linear-gradient(120deg,#f8fafc,#e2e8f0,#cbd5e1)",
  "flat:red": "#ef4444", "flat:orange": "#f97316", "flat:amber": "#f59e0b", "flat:green": "#22c55e",
  "flat:teal": "#14b8a6", "flat:blue": "#3b82f6", "flat:indigo": "#6366f1", "flat:purple": "#a855f7",
  "flat:pink": "#ec4899", "flat:stone": "#78716c",
};
export const isPresetCover = (cover?: string): boolean =>
  !!cover && (cover.startsWith("preset:") || cover.startsWith("flat:"));

export const coverBackground = (cover?: string, coverY = 50): string | undefined =>
  !cover ? undefined
    : isPresetCover(cover) ? COVER_PRESETS[cover]
    : `center ${coverY}%/cover no-repeat url("${cover}")`;

// distribute Omit over the union so each member keeps its own props (a bare Omit<Block,"id">
// would collapse to the keys common to ALL members)
type BlockInput = Block extends infer T ? (T extends Block ? Omit<T, "id"> : never) : never;
const B = (b: BlockInput): Block => ({ id: bid(), ...b } as Block);

/* a tiny inline SVG so the demo image block renders without a network fetch (CSP-safe) */
const DEMO_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='220'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6366f1'/><stop offset='1' stop-color='#ec4899'/></linearGradient></defs><rect width='640' height='220' fill='url(#g)'/><text x='32' y='120' fill='white' font-family='system-ui' font-size='30' font-weight='700'>A document, not a text box.</text></svg>`,
  );

/* seedDocument — the flagship demo AND the deterministic journey fixture. Exercises every
   block type + inline mark, and seeds several headings so the live outline has structure. */
export function seedDocument(): DocumentSnapshot {
  const blocks: Block[] = [
    B({ type: "h1", text: "Overview" }),
    B({ type: "p", text: "A document surface with the depth of **Notion** and the import/export parity of *Google Docs*. Everything here is editable — press `/` for the block menu, or select text for the formatting bar. This intro shows inline marks: ==highlighted==, ++underlined++, ~~struck~~, `inline code`, and [a link](https://nexus.example)." }),
    B({ type: "callout", text: "This whole page is one **DocumentSnapshot** — the same free-surface shape as the workbook block, so a Pages host can mount it with near-zero wiring.", emoji: "💡", tone: "info" }),
    B({ type: "h2", text: "Goals" }),
    B({ type: "todo", text: "Block-rich editing — headings, lists, to-dos, toggles, callouts, code", checked: true }),
    B({ type: "todo", text: "A live outline that tracks the section you are reading", checked: true }),
    B({ type: "todo", text: "Word & Google-Docs import / export (DOCX, PDF, HTML, Markdown)", checked: false }),
    B({ type: "todo", text: "Ship the standalone DocumentSurface for the Pages primitive", checked: false }),
    B({ type: "h2", text: "How it fits together" }),
    B({ type: "toggle", text: "The block model (click to expand)", collapsed: false }),
    B({ type: "p", text: "A **flat** `Block[]` with an optional `indent` level — nesting without a child tree, so every existing consumer keeps working.", indent: 1 }),
    B({ type: "ul", text: "Paragraph, H1–H3, quote, divider, image, table (already shipped)", indent: 1 }),
    B({ type: "ul", text: "To-do, toggle, callout, code, nested lists (added)", indent: 1 }),
    B({ type: "ul", text: "…and each can nest a level deeper", indent: 2 }),
    B({ type: "h2", text: "A quick example" }),
    B({ type: "code", text: "type Block =\n  | { type: \"todo\"; text: string; checked?: boolean }\n  | { type: \"toggle\"; text: string; collapsed?: boolean }\n  | { type: \"callout\"; text: string; emoji?: string };\n\nconst done = blocks.filter(b => b.type === \"todo\" && b.checked);", lang: "ts" }),
    B({ type: "quote", text: "If Notion and Google Docs had a child — block-rich, keyboard-first, and portable to Word." }),
    B({ type: "h2", text: "Data" }),
    B({ type: "table", rows: [["Feature", "Notion", "Google Docs", "Aurora"], ["Blocks", "yes", "no", "yes"], ["DOCX round-trip", "partial", "yes", "yes"], ["Live outline", "yes", "yes", "yes"]] }),
    B({ type: "image", src: DEMO_IMG, caption: "Every surface is composable and config-driven." }),
    B({ type: "p", text: "" }),
  ];
  return { id: "document-demo", title: "Product Requirements — Aurora", icon: "📄", cover: "preset:dusk", pageWidth: "narrow", blocks, version: 1 };
}
