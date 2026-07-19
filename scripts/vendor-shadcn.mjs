#!/usr/bin/env node
/* Vendor shadcn/ui component SOURCE (MIT © shadcn) into src/components/ui/.
   This is the vendor-sync lever: re-run to refresh from the registry (upstream ideas
   tracked via the read-only fork github.com/achammah/ui). Style: new-york-v4
   (Tailwind v4). Each run overwrites vendored files verbatim and records the set in
   src/components/ui/.vendor-manifest.json — local edits belong in wrappers
   (src/primitives/*), never in vendored files. */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "src");
const OUT = path.join(SRC, "components", "ui");
const STYLE = "new-york-v4";
const COMPONENTS = [
  // core controls
  "button", "badge", "input", "label", "textarea", "checkbox", "select", "tabs",
  "radio-group", "slider", "switch", "toggle", "toggle-group", "input-otp",
  // overlays + nav
  "dialog", "alert-dialog", "sheet", "drawer", "dropdown-menu", "context-menu",
  "menubar", "navigation-menu", "hover-card", "tooltip", "popover", "command",
  "breadcrumb", "pagination", "sidebar",
  // structure + display
  "table", "separator", "scroll-area", "avatar", "skeleton", "card", "alert",
  "accordion", "collapsible", "aspect-ratio", "carousel", "resizable", "progress",
  // data + forms + feedback
  "form", "calendar", "chart", "sonner",
  // registry hook deps (fetched explicitly — the script resolves named items only)
  "use-mobile",
];

// registry file types → destinations (hooks/lib files ride along with some items)
const DEST = {
  "registry:ui": OUT,
  "registry:hook": path.join(SRC, "hooks"),
  "registry:lib": path.join(SRC, "lib"),
};
for (const d of Object.values(DEST)) mkdirSync(d, { recursive: true });
const manifest = { style: STYLE, fetchedAt: new Date().toISOString(), source: "https://ui.shadcn.com/r", components: {} };
const deps = new Set();

for (const name of COMPONENTS) {
  const url = `https://ui.shadcn.com/r/styles/${STYLE}/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL ${name}: ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const item = await res.json();
  for (const d of item.dependencies ?? []) deps.add(d);
  for (const f of item.files ?? []) {
    const base = path.basename(f.path);
    const dest = DEST[f.type] ?? OUT;
    // Registry source cross-imports via its internal layout — rewrite to our aliases.
    const content = f.content
      .replaceAll(`@/registry/${STYLE}/ui/`, "@/components/ui/")
      .replaceAll(`@/registry/${STYLE}/lib/`, "@/lib/")
      .replaceAll(`@/registry/${STYLE}/hooks/`, "@/hooks/");
    writeFileSync(path.join(dest, base), content);
    (manifest.components[name] ??= { files: [], deps: item.dependencies ?? [] })
      .files.push(path.relative(SRC, path.join(dest, base)));
  }
  console.log(`  ok ${name}`);
}
writeFileSync(path.join(OUT, ".vendor-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nvendored ${Object.keys(manifest.components).length}/${COMPONENTS.length} → src/components/ui`);
console.log("registry deps:", [...deps].join(", "));
