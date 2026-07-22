import { bid, type Block } from "../../record-core/NotionEditor";
import type { Suggestion } from "../../record-core/useSuggestions";

/* page-store — the SPINE of the page workspace. In Notion "everything is a page; pages
   nest and reference each other." This is that model.

   STORAGE IS FLAT (an adjacency list): a `Record<id, PageNode>` keyed by page id, each page
   pointing at its `parentId`. The tree, breadcrumbs, backlinks, and search are all DERIVED
   by scanning the map — never stored redundantly. Why flat:
     · external-writer-tolerant — a concurrent writer patches ONE page's entry without
       touching any tree structure, so a merge is per-page (no structural conflicts);
     · moves/renames touch one page, not a nested subtree;
     · backlinks + full-text search are a single map scan.
   Sibling order is a FRACTIONAL `order` key, so inserting/moving a page rewrites only the
   moved page (midpoint between neighbours), never a re-index of its siblings.

   The whole store persists as ONE free-surface blob (host owns load/persist), exactly like
   the workbook/document snapshots. Everything here is PURE + node-testable (no React, no DOM). */

export interface PageNode {
  id: string;
  title: string;
  icon?: string;               // emoji
  cover?: string;              // "preset:<key>" | "flat:<key>" | data: URI
  coverY?: number;             // vertical focal point (0-100%) for an uploaded image cover
  parentId: string | null;     // null = a top-level page
  order: number;               // fractional sort key among siblings
  blocks: Block[];             // the page body
  suggestions?: Suggestion[];  // tracked changes (suggesting mode), persisted with the page
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PageStore {
  version: number;
  pages: Record<string, PageNode>;
  activeId?: string;                        // the open page (persisted for convenience)
  expanded?: Record<string, boolean>;       // tree expand/collapse state
}

export const PAGE_STORE_PREFIX = "pageworkspace:";
export const pageStoreKey = (key: string): string => `${PAGE_STORE_PREFIX}${key}`;

export function isPageStore(x: unknown): x is PageStore {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return typeof s.pages === "object" && s.pages !== null && !Array.isArray(s.pages);
}

const now = () => Date.now();
const pid = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/* ---- tree derivation (pure, all sorted by fractional order) ---- */
export const rootPages = (s: PageStore): PageNode[] => childrenOf(s, null);
export function childrenOf(s: PageStore, parentId: string | null): PageNode[] {
  return Object.values(s.pages).filter((p) => p.parentId === parentId).sort((a, b) => a.order - b.order);
}
export function breadcrumb(s: PageStore, id: string): PageNode[] {
  const out: PageNode[] = []; let cur: PageNode | undefined = s.pages[id]; const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = cur.parentId ? s.pages[cur.parentId] : undefined; }
  return out;
}
export function descendants(s: PageStore, id: string): string[] {
  const out: string[] = []; const stack = [id];
  while (stack.length) { const cur = stack.pop()!; for (const c of childrenOf(s, cur)) { out.push(c.id); stack.push(c.id); } }
  return out;
}
// a move target is illegal if it is the page itself or one of its descendants (would orphan a cycle)
export const isDescendant = (s: PageStore, id: string, maybeAncestor: string): boolean =>
  id === maybeAncestor || descendants(s, maybeAncestor).includes(id);

/* ---- fractional ordering: a new key between two neighbours (or at an end) ---- */
function orderBetween(before?: number, after?: number): number {
  if (before == null && after == null) return 0;
  if (before == null) return after! - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}
// the order for inserting a new/moved page among `siblings` (already sorted), after `afterId`
// (or at the end when afterId is null/absent, at the start when afterId === "start")
function orderAmong(siblings: PageNode[], afterId?: string | null): number {
  if (afterId === "start") return orderBetween(undefined, siblings[0]?.order);
  if (afterId == null) return orderBetween(siblings[siblings.length - 1]?.order, undefined);
  const i = siblings.findIndex((p) => p.id === afterId);
  if (i < 0) return orderBetween(siblings[siblings.length - 1]?.order, undefined);
  return orderBetween(siblings[i].order, siblings[i + 1]?.order);
}

const put = (s: PageStore, page: PageNode): PageStore => ({ ...s, pages: { ...s.pages, [page.id]: page } });
const patch = (s: PageStore, id: string, p: Partial<PageNode>): PageStore => {
  const cur = s.pages[id]; if (!cur) return s;
  return put(s, { ...cur, ...p, updatedAt: now() });
};

/* ---- mutations (pure — each returns the next store) ---- */
export function createPage(s: PageStore, opts: { parentId?: string | null; title?: string; afterId?: string | null; id?: string; blocks?: Block[] } = {}): { store: PageStore; id: string } {
  const id = opts.id || pid();
  const parentId = opts.parentId ?? null;
  const order = orderAmong(childrenOf(s, parentId), opts.afterId ?? null);
  const page: PageNode = { id, title: opts.title ?? "", parentId, order, blocks: opts.blocks ?? [{ id: bid(), type: "p", text: "" }], createdAt: now(), updatedAt: now() };
  return { store: put(s, page), id };
}
export function duplicatePage(s: PageStore, id: string): { store: PageStore; id: string } {
  const src = s.pages[id]; if (!src) return { store: s, id };
  // deep-copy the page AND its descendant subtree, remapping ids + parent pointers
  const idMap: Record<string, string> = {};
  const subtree = [id, ...descendants(s, id)];
  for (const old of subtree) idMap[old] = pid();
  let store = s;
  for (const old of subtree) {
    const p = s.pages[old];
    const clone: PageNode = {
      ...structuredCloneSafe(p), id: idMap[old],
      parentId: p.id === id ? p.parentId : idMap[p.parentId!],
      order: p.id === id ? orderAmong(childrenOf(s, p.parentId), id) : p.order,
      title: p.id === id ? `${p.title || "Untitled"} (copy)` : p.title,
      blocks: remapPageBlocks(p.blocks, idMap), createdAt: now(), updatedAt: now(),
    };
    store = put(store, clone);
  }
  return { store, id: idMap[id] };
}
export function deletePage(s: PageStore, id: string): PageStore {
  const kill = new Set([id, ...descendants(s, id)]);
  const pages: Record<string, PageNode> = {};
  for (const [k, v] of Object.entries(s.pages)) if (!kill.has(k)) pages[k] = v;
  const activeId = s.activeId && kill.has(s.activeId) ? s.pages[id]?.parentId ?? Object.keys(pages)[0] : s.activeId;
  return { ...s, pages, activeId: activeId ?? undefined };
}
export function movePage(s: PageStore, id: string, newParentId: string | null, afterId?: string | null): PageStore {
  const p = s.pages[id]; if (!p) return s;
  if (newParentId != null && isDescendant(s, newParentId, id)) return s; // never move into own subtree
  const siblings = childrenOf(s, newParentId).filter((x) => x.id !== id);
  const order = orderAmong(siblings, afterId ?? null);
  return patch(s, id, { parentId: newParentId, order });
}
export function reorderPage(s: PageStore, id: string, afterId?: string | null): PageStore {
  const p = s.pages[id]; if (!p) return s;
  const siblings = childrenOf(s, p.parentId).filter((x) => x.id !== id);
  return patch(s, id, { order: orderAmong(siblings, afterId ?? null) });
}
export const renamePage = (s: PageStore, id: string, title: string): PageStore => patch(s, id, { title });
export const setPageIcon = (s: PageStore, id: string, icon?: string): PageStore => patch(s, id, { icon });
export const setPageCover = (s: PageStore, id: string, cover?: string, coverY?: number): PageStore => patch(s, id, { cover, coverY });
export const setPageBlocks = (s: PageStore, id: string, blocks: Block[]): PageStore => patch(s, id, { blocks });
export const setPageSuggestions = (s: PageStore, id: string, suggestions: Suggestion[]): PageStore => patch(s, id, { suggestions });
export const toggleFavorite = (s: PageStore, id: string): PageStore => patch(s, id, { favorite: !s.pages[id]?.favorite });
export const setActive = (s: PageStore, id: string): PageStore => ({ ...s, activeId: id });
export const setExpanded = (s: PageStore, id: string, open: boolean): PageStore => ({ ...s, expanded: { ...s.expanded, [id]: open } });
export const favorites = (s: PageStore): PageNode[] => Object.values(s.pages).filter((p) => p.favorite).sort((a, b) => a.title.localeCompare(b.title));

/* ---- links + backlinks (derived) ----
   two link kinds live in a page's blocks: an inline PAGE-LINK token `[[page:<id>|<title>]]`
   in text, and a SUB-PAGE block `{type:"page", pageId}`. Plus the parent→child relation.
   The backlink index answers "what points at this page?" for the linked-references panel. */
export const PAGE_LINK_RE = /\[\[page:([^\]|]+)(?:\|([^\]]*))?\]\]/g;
export interface PageRef { fromId: string; kind: "link" | "subpage" | "child"; snippet?: string }

export function outboundRefs(page: PageNode): { toId: string; kind: "link" | "subpage" }[] {
  const refs: { toId: string; kind: "link" | "subpage" }[] = [];
  for (const b of page.blocks) {
    if (b.type === "page") { refs.push({ toId: b.pageId, kind: "subpage" }); continue; }
    if ("text" in b && b.text) { let m: RegExpExecArray | null; PAGE_LINK_RE.lastIndex = 0; while ((m = PAGE_LINK_RE.exec(b.text))) refs.push({ toId: m[1], kind: "link" }); }
  }
  return refs;
}
export function backlinksOf(s: PageStore, id: string): PageRef[] {
  const out: PageRef[] = [];
  const child = s.pages[id];
  if (child?.parentId) out.push({ fromId: child.parentId, kind: "child" });
  for (const p of Object.values(s.pages)) {
    if (p.id === id) continue;
    for (const r of outboundRefs(p)) if (r.toId === id) out.push({ fromId: p.id, kind: r.kind, snippet: firstText(p) });
  }
  return out;
}

/* ---- full-text search (derived) ---- */
export interface SearchHit { page: PageNode; where: "title" | "body"; snippet: string }
export function searchPages(s: PageStore, query: string, limit = 20): SearchHit[] {
  const q = query.trim().toLowerCase(); if (!q) return [];
  const hits: SearchHit[] = [];
  for (const p of Object.values(s.pages)) {
    if ((p.title || "Untitled").toLowerCase().includes(q)) { hits.push({ page: p, where: "title", snippet: p.title || "Untitled" }); continue; }
    const body = plainText(p);
    const i = body.toLowerCase().indexOf(q);
    if (i >= 0) hits.push({ page: p, where: "body", snippet: snippetAround(body, i, q.length) });
  }
  // title matches first, then by recency
  hits.sort((a, b) => (a.where === b.where ? b.page.updatedAt - a.page.updatedAt : a.where === "title" ? -1 : 1));
  return hits.slice(0, limit);
}

/* ---- helpers ---- */
const stripInline = (t: string) => t.replace(/\[\[[a-z]+:[^\]|]*\|?([^\]]*)\]\]/g, "$1").replace(/(\*\*|__|~~|\+\+|==|`|\*|_|^#{1,3}\s|^>\s|^-\s)/gm, "").trim();
export const plainText = (p: PageNode): string => p.blocks.map((b) => (b.type === "table" ? b.rows.flat().join(" ") : "text" in b ? stripInline(b.text) : "")).join(" ").replace(/\s+/g, " ").trim();
const firstText = (p: PageNode): string => { for (const b of p.blocks) if ("text" in b && b.text.trim()) return stripInline(b.text).slice(0, 80); return ""; };
const snippetAround = (body: string, i: number, len: number): string => { const start = Math.max(0, i - 30); return (start > 0 ? "…" : "") + body.slice(start, i + len + 40).trim() + "…"; };
// remap page-link tokens + sub-page blocks to new ids when duplicating a subtree
function remapPageBlocks(blocks: Block[], idMap: Record<string, string>): Block[] {
  return blocks.map((b) => {
    if (b.type === "page") return { ...b, id: bid(), pageId: idMap[b.pageId] || b.pageId };
    if ("text" in b) return { ...b, id: bid(), text: b.text.replace(PAGE_LINK_RE, (m, id, title) => `[[page:${idMap[id] || id}|${title || ""}]]`) } as Block;
    return { ...b, id: bid() } as Block;
  });
}
function structuredCloneSafe<T>(x: T): T { try { return structuredClone(x); } catch { return JSON.parse(JSON.stringify(x)); } }

/* ---- seed: a small nested workspace so the tree, breadcrumbs, backlinks, links, search,
        sub-page blocks and outline all have real content on first load ---- */
// distribute Omit over the Block union so each member keeps its own props
type BlockInput = Block extends infer T ? (T extends Block ? Omit<T, "id"> : never) : never;
const B = (b: BlockInput): Block => ({ id: bid(), ...b } as Block);

export function seedPageStore(): PageStore {
  const home = "seed-home", eng = "seed-eng", arch = "seed-arch", onb = "seed-onboarding", roadmap = "seed-roadmap";
  const pages: Record<string, PageNode> = {};
  const add = (p: Omit<PageNode, "createdAt" | "updatedAt">) => { pages[p.id] = { ...p, createdAt: now(), updatedAt: now() }; };
  add({ id: home, title: "Aurora Handbook", icon: "📘", cover: "preset:dusk", parentId: null, order: 0, blocks: [
    B({ type: "callout", text: "Everything here is a **page**. Pages nest and link — try the tree on the left, `Cmd-K`, or type `[[` to link a page. Welcome, [[c:gray|You]].", emoji: "💡", tone: "info" }),
    B({ type: "p", text: "This handbook is the single source of truth for how the Aurora team designs, builds, and ships. It is a living document — edit any block, drag to reorder, or switch to **Suggesting** mode to propose a change without overwriting." }),

    B({ type: "h2", text: "How this handbook works" }),
    B({ type: "p", text: "Every heading you see appears in the outline on the right — click one to jump to it. The document scrolls independently of the app, so long pages stay navigable." }),
    B({ type: "ul", text: "**Pages** nest infinitely — a page can hold sub-pages, which hold their own." }),
    B({ type: "ul", text: "**Links** with `[[` connect any two pages; backlinks are tracked automatically." }),
    B({ type: "ul", text: "**Suggesting** mode turns your edits into tracked changes an editor can accept or reject." }),

    B({ type: "h2", text: "Spaces" }),
    B({ type: "p", text: "The handbook is organised into spaces. Each is a page you can open, nest under, and link to." }),
    B({ type: "page", pageId: eng }),
    B({ type: "page", pageId: roadmap }),
    B({ type: "p", text: "See the [[page:seed-eng|Engineering]] space for architecture + onboarding." }),

    B({ type: "h2", text: "Working agreements" }),
    B({ type: "h3", text: "Communication" }),
    B({ type: "p", text: "Default to writing. A decision that lives only in a call is a decision that will be re-litigated. Capture it here, link it from the relevant page, and move on." }),
    B({ type: "h3", text: "Reviews" }),
    B({ type: "p", text: "Every change gets a second pair of eyes. In this handbook that means Suggesting mode; in code it means a pull request. Nothing ships unreviewed." }),
    B({ type: "quote", text: "Make it work, make it right, make it fast — in that order, and never skip the middle step." }),

    B({ type: "h2", text: "The build loop" }),
    B({ type: "p", text: "We ship in small, reversible steps. The loop is deliberately boring so the interesting work stays in the product, not the process." }),
    B({ type: "ol", text: "Frame the problem in one sentence with a verifiable outcome." }),
    B({ type: "ol", text: "Build the smallest thing that proves the outcome." }),
    B({ type: "ol", text: "Review, measure, and either keep going or roll back." }),
    B({ type: "h3", text: "Definition of done" }),
    B({ type: "todo", text: "The outcome is verifiable and verified", checked: true }),
    B({ type: "todo", text: "A reviewer has accepted the change", checked: false }),
    B({ type: "todo", text: "Docs and this handbook reflect reality", checked: false }),

    B({ type: "h2", text: "Architecture at a glance" }),
    B({ type: "p", text: "The workspace is a flat store of pages; structure is expressed by `parentId` and fractional ordering, never by nesting the data itself. That keeps moves O(1) and links stable." }),
    B({ type: "code", text: "interface PageNode { id; title; parentId; order; blocks; suggestions? }", lang: "ts" }),
    B({ type: "p", text: "The deep dive lives in [[page:seed-arch|Architecture]]." }),

    B({ type: "divider" }),

    B({ type: "h2", text: "Onboarding" }),
    B({ type: "p", text: "New to the team? Start with the [[page:seed-onboarding|Onboarding]] checklist under Engineering, then read the two spaces above top to bottom." }),
    B({ type: "h3", text: "Your first week" }),
    B({ type: "todo", text: "Read this handbook end to end", checked: false }),
    B({ type: "todo", text: "Pair with someone on a real change", checked: false }),
    B({ type: "todo", text: "Ship one small thing to production", checked: false }),

    B({ type: "h2", text: "FAQ" }),
    B({ type: "toggle", text: "How do I propose a change without overwriting?", collapsed: true }),
    B({ type: "p", text: "Switch to Suggesting mode (top-right). Your edits become tracked changes with your name on them; an editor accepts or rejects each one.", indent: 1 }),
    B({ type: "toggle", text: "How do I link another page?", collapsed: true }),
    B({ type: "p", text: "Type `[[` and start searching — pick a page or create a new one inline.", indent: 1 }),
  ] });
  add({ id: eng, title: "Engineering", icon: "🛠️", parentId: home, order: 0, blocks: [
    B({ type: "p", text: "Sub-pages:" }),
    B({ type: "page", pageId: arch }),
    B({ type: "page", pageId: onb }),
  ] });
  add({ id: arch, title: "Architecture", icon: "🏗️", parentId: eng, order: 0, blocks: [
    B({ type: "p", text: "The page store is a flat adjacency list — see the [[page:seed-home|Aurora Handbook]]." }),
    B({ type: "code", text: "interface PageNode { id; title; parentId; order; blocks }", lang: "ts" }),
  ] });
  add({ id: onb, title: "Onboarding", icon: "🚀", parentId: eng, order: 1, favorite: true, blocks: [
    B({ type: "todo", text: "Clone the repo", checked: true }),
    B({ type: "todo", text: "Read [[page:seed-arch|Architecture]]", checked: false }),
  ] });
  add({ id: roadmap, title: "Roadmap", icon: "🗺️", parentId: home, order: 1, blocks: [
    B({ type: "toggle", text: "Q3", collapsed: false }),
    B({ type: "todo", text: "Ship the page workspace", checked: false, indent: 1 }),
  ] });
  return { version: 1, pages, activeId: home, expanded: { [home]: true, [eng]: true } };
}
