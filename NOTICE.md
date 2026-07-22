# Third-party notices

## shadcn/ui
`src/components/ui/*` is vendored SOURCE from shadcn/ui (https://ui.shadcn.com, https://github.com/shadcn-ui/ui), © shadcn, licensed MIT. Vendored via `scripts/vendor-shadcn.mjs` (style `new-york-v4`; set + versions in `src/components/ui/.vendor-manifest.json`). Local modifications live in wrappers (`src/primitives/`), never in vendored files — re-running the vendor script overwrites them by design. Upstream is tracked via the read-only fork `github.com/achammah/ui`.

MIT License — Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## ToyCar sample model
`src/blocks/viewer3d/assets/toy-car.glb` is the "ToyCar" sample asset from the Khronos glTF-Sample-Assets repository (https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar), dedicated to the public domain under **CC0 1.0 Universal** (initial car model © 2020 Guido Odendahl; extensions and scene composition Eric Chadwick — both CC0 per the model's metadata.json). It ships purely as a demo/import-showcase asset; no attribution is legally required, recorded here as a courtesy and for provenance.

Other dependencies (radix-ui, cmdk, TanStack, dnd-kit, lucide, cva, clsx, tailwind-merge, tw-animate-css, Tailwind, docx) are consumed as npm packages under their own MIT/ISC licenses. `mammoth` (used for .docx import, lazy-loaded) is licensed **BSD-2-Clause** © Michael Williamson — a permissive license; no copyleft enters this repo.
