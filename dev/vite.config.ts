import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  root: __dirname,
  /* Tailwind v4 compiles the shadcn layer — without it the vendored Button /
     DropdownMenu render unstyled and the harness would not show what the app
     actually renders. */
  plugins: [tailwind(), react()],
  /* the vendored shadcn components import through the `@/` alias, exactly as
     they do in a consuming app — the harness mirrors that resolution */
  /* The vendored shadcn components are the React-19 generation: they take `ref`
     as a plain prop instead of forwardRef. Under React 18 that ref never reaches
     the DOM, Radix's popper never anchors, and every dropdown renders off-screen
     at translate(0,-200%). The consuming app runs React 19, so the harness pins
     19 too — otherwise the harness would misreport working chrome as broken.
     (react lives outside this tree because the repo's own install resolves 18
     for @excalidraw's peer range.) */
  resolve: {
    alias: {
      "@": join(repo, "src"),
      react: "/tmp/pres-react19/node_modules/react",
      "react-dom": "/tmp/pres-react19/node_modules/react-dom",
      "react/jsx-runtime": "/tmp/pres-react19/node_modules/react/jsx-runtime",
      "react/jsx-dev-runtime": "/tmp/pres-react19/node_modules/react/jsx-dev-runtime",
    },
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5342, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
