import * as React from "react";
import { createRoot } from "react-dom/client";
import "@ui/tokens/tokens.css";
import { LazyViewer3DSurface, seedScene, isViewer3dSnapshot, viewer3dStoreKey, type Viewer3DSnapshot } from "@ui/blocks/viewer3d";

function usePersisted(pageKey: string, seed: () => Viewer3DSnapshot): [Viewer3DSnapshot, (s: Viewer3DSnapshot) => void] {
  const key = viewer3dStoreKey(pageKey);
  const [snap, setSnap] = React.useState<Viewer3DSnapshot>(() => {
    try { const raw = localStorage.getItem(key); const p = raw ? JSON.parse(raw) : null; return isViewer3dSnapshot(p) ? p : seed(); }
    catch { return seed(); }
  });
  const save = (s: Viewer3DSnapshot) => { setSnap(s); localStorage.setItem(key, JSON.stringify(s)); };
  return [snap, save];
}

function App() {
  const params = new URLSearchParams(location.search);
  const which = params.get("scene") === "floorplan" ? "floorplan" : params.get("scene") === "broken" ? "broken" : "vehicle";
  const [snap, save] = usePersisted(`demo-${which}`, () =>
    which === "broken"
      ? { ...seedScene("vehicle"), object: { source: { type: "gltf", url: "/nope/missing.glb" } } }
      : seedScene(which as "vehicle" | "floorplan"));
  const [theme, setTheme] = React.useState<string>(params.get("theme") ?? "light");
  const [mounted, setMounted] = React.useState(true);
  const mountCount = React.useRef(0);
  if (mounted) mountCount.current += 0;
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 8, display: "flex", gap: 8, borderBottom: "1px solid var(--nx-border)" }}>
        <a href="?scene=vehicle">vehicle</a><a href="?scene=floorplan">floorplan</a><a href="?scene=broken">broken</a>
        <button data-testid="theme-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>theme: {theme}</button>
        <button data-testid="mount-toggle" onClick={() => setMounted(m => !m)}>{mounted ? "unmount" : "mount"}</button>
        
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <React.Suspense fallback={<div style={{ padding: 24 }}>Loading engine…</div>}>
          {mounted && <LazyViewer3DSurface value={snap} onChange={save} />}
        </React.Suspense>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
