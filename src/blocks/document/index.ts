/* Document block — a Notion×Google-Docs document surface. Unlike the workbook block (whose
   ~1.6MB Univer engine MUST be lazy), this surface is LIGHT (the block editor + outline), so
   it is exported EAGERLY for near-zero Pages wiring. Its only heavy dependencies (`docx` for
   .docx export, `mammoth` for .docx import) are dynamically imported INSIDE editor-io, so
   they load only when the user actually exports/imports — never in the base bundle. A host
   that still wants to code-split the whole surface can wrap it in React.lazy itself. */

export {
  DOCUMENT_STORE_PREFIX,
  documentStoreKey,
  isDocumentSnapshot,
  seedDocument,
  COVER_PRESETS,
  coverBackground,
} from "./snapshot";
export type { DocumentSnapshot } from "./snapshot";

export { DocumentSurface } from "./DocumentSurface";
export type { DocumentSurfaceProps, DocumentConfig } from "./DocumentSurface";

/* the page workspace — the linked page system (tree + nested pages + links + backlinks +
   Cmd-K) that the Pages host mounts for a kind:"document" page. value = the whole PageStore. */
export { PageWorkspace, resolveWorkspaceConfig } from "./PageWorkspace";
export type { PageWorkspaceProps, WorkspaceConfig, WorkspaceLayout, TreeMode, PageIndexEntry } from "./PageWorkspace";
export { PageTree } from "./PageTree";
export type { PageTreeProps } from "./PageTree";
export {
  PAGE_STORE_PREFIX, pageStoreKey, isPageStore, seedPageStore,
  createPage, duplicatePage, deletePage, movePage, reorderPage, renamePage,
  setPageIcon, setPageCover, setPageBlocks, toggleFavorite, setActive, setExpanded,
  rootPages, childrenOf, breadcrumb, descendants, backlinksOf, outboundRefs, searchPages, favorites, plainText,
} from "./page-store";
export type { PageStore, PageNode, PageRef, SearchHit } from "./page-store";
