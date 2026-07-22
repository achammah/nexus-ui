import * as React from "react";
import { createRoot } from "react-dom/client";
import "../src/tokens/tokens.css";
/* the app's shadcn layer (via the harness sheet, which points Tailwind at src/) —
   the vendored Button/DropdownMenu/Tooltip primitives are styled by it exactly
   as in a consuming app */
import "./harness.css";
import {
  PresentationSurface,
  PresentationViewer,
  applyViewEvent,
  isDeckSnapshot,
  presentationStoreKey,
  seedDeck,
  type DeckSnapshot,
} from "../src/blocks/presentation";

/* dev harness — mimics the app's data seam with localStorage under the real
   namespaced store key, plus the hash viewer route the default share URL targets. */
const KEY = presentationStoreKey("dev-demo");

function load(): DeckSnapshot {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (isDeckSnapshot(parsed)) return parsed;
  } catch {
    /* fall through to seed */
  }
  return seedDeck();
}

function App() {
  const [route, setRoute] = React.useState(location.hash);
  const [nonce, setNonce] = React.useState(0);
  const deckRef = React.useRef<DeckSnapshot>(load());
  React.useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const persist = (d: DeckSnapshot) => {
    deckRef.current = d;
    localStorage.setItem(KEY, JSON.stringify(d));
  };

  const m = route.match(/^#\/share\/(.+)$/);
  if (m) {
    return (
      <PresentationViewer
        deck={deckRef.current}
        slug={decodeURIComponent(m[1])}
        onEvent={(ev) => persist(applyViewEvent(deckRef.current, ev))}
      />
    );
  }

  return (
    <PresentationSurface
      value={deckRef.current}
      onChange={persist}
      reloadNonce={nonce}
      actions={
        <>
          <button
            className="nxPresBtn"
            onClick={() => {
              const dark = document.documentElement.dataset.theme === "dark";
              document.documentElement.dataset.theme = dark ? "light" : "dark";
            }}
          >
            ◐
          </button>
          <button
            className="nxPresBtn"
            onClick={() => {
              localStorage.removeItem(KEY);
              deckRef.current = seedDeck();
              setNonce((n) => n + 1);
            }}
          >
            Reset
          </button>
        </>
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
