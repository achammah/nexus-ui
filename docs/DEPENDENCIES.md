# DEPENDENCIES — document surface

New runtime dependencies added for the document surface's Word/Google-Docs import & export. Both are permissive and **lazy-loaded** — they are imported only behind dynamic `import()` inside `src/record-core/editor-io.ts`, so they never enter the base bundle.

| Package | Version | License | Used for | Load |
|---|---|---|---|---|
| `docx` | 9.7.1 | MIT | `.docx` export (real headings, lists, tables, inline marks) | lazy — on export only |
| `mammoth` | 1.12.0 | BSD-2-Clause | `.docx` import (docx → HTML → blocks) | lazy — on import only |

Dev-only: `typescript`, `@types/react`, `@types/react-dom` (the repo relies on the consumer's React types; these are for the local `typecheck` script and are not shipped).

## Bundle impact (measured, gzipped)

Built via a minimal vite harness bundling the document paths:

| Chunk | raw | gzip | when it loads |
|---|---|---|---|
| base (editor + surface + outline + editor-io pure parts + React + used lucide icons) | 236 kB | **73.8 kB** | eagerly |
| `docx` chunk | 411 kB | 118 kB | only when the user exports `.docx` |
| `mammoth` chunk | 496 kB | 130 kB | only when the user imports `.docx` |
| CSS | 11.7 kB | 2.9 kB | eagerly |

So importing/using `DocumentSurface` adds ~73.8 kB gz to a page (most of which is React itself, shared with any other surface); the two large libraries stay out of the base bundle and only download when a user actually triggers a Word export/import.

## Deliberate zero-dependency choices (seams)

- **PDF export** uses the browser's own print pipeline (a self-contained styled window → Save as PDF), not a PDF library. This is the most faithful route (the browser renders the exact document CSS) and adds **zero** bundle weight. If a consumer needs headless/programmatic PDF bytes, `jsPDF` (MIT) is the drop-in seam — but print-to-PDF was chosen as the robust default.
- **Syntax highlighting** in code blocks is a small dependency-free tokenizer (comments/strings/numbers/keywords) — no `highlight.js`/`prism`/`shiki`. It is intentionally approximate (reads as highlighted across common languages) in exchange for zero bundle cost.

## Fidelity boundaries (honest seams, not bugs)

- **DOCX round-trip** preserves headings, lists, tables, and all text. Word's document model has no native to-do / callout / code-block, so on a re-import those degrade to paragraphs (the same boundary Google Docs hits exporting to Word). Markdown and HTML round-trip losslessly.
- **DOCX image export**: data-URI images are written as a labeled placeholder line rather than embedded, to keep the export lean. Embedding is a clean follow-up (docx supports `ImageRun` from a data URI) if inline images in Word exports become a requirement.
