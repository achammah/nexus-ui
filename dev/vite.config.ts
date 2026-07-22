import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 5342, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
