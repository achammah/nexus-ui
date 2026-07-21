import * as React from "react";

/* Follow the app's live theme: the shell stamps `data-theme` on <html> at boot
   and on every toggle (the single theme source; skins layer over it). Observing
   the attribute keeps an already-mounted canvas in step with a live dark-flip.
   Whiteboard-local on purpose — general token→literal resolution is the token
   resolver's job; this only mirrors the theme NAME for excalidraw's theme prop. */
export function useNxTheme(): "light" | "dark" {
  const read = () =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const [theme, setTheme] = React.useState<"light" | "dark">(read);
  React.useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}
