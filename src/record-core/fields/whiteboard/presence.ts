/* Collaborative presence seam — remote cursors + selections on the board.

   The canvas talks to a PROVIDER interface, never a transport directly, so the wire
   is swappable: today a same-origin BroadcastChannel (real cross-TAB presence, no
   server — open the same board in two tabs and the cursors track each other); the
   later yjs foundation drops in behind the SAME interface with zero canvas changes.
   Presence is opt-in (config.presence); default off → no provider, no channel.

   Provider is excalidraw-agnostic (emits plain peers); the canvas maps peers →
   excalidraw's `collaborators`. Node/SSR-safe: no BroadcastChannel → a null provider. */

export interface PresencePeer {
  id: string;
  username: string;
  color: string; // hex; the canvas derives excalidraw's {background,stroke}
  pointer?: { x: number; y: number } | null;
  selectedIds?: string[];
  updatedAt: number;
}

export interface WhiteboardPresence {
  self: PresencePeer;
  subscribe(cb: (peers: PresencePeer[]) => void): () => void;
  broadcastPointer(p: { x: number; y: number } | null): void;
  broadcastSelection(ids: string[]): void;
  dispose(): void;
}

const PEER_COLORS = ["#1971c2", "#2f9e44", "#e8590c", "#6741d9", "#e64980", "#0c8599", "#f08c00"];
export const randomPeerColor = () => PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];

const STALE_MS = 12000; // drop a peer we have not heard from in this long
const HEARTBEAT_MS = 4000;

type Msg =
  | { kind: "hello" | "heartbeat" | "state"; peer: PresencePeer }
  | { kind: "bye"; id: string };

/* BroadcastChannel-backed presence: same-origin, cross-tab, zero-server. */
export function createBroadcastPresence(boardId: string, self: PresencePeer): WhiteboardPresence {
  if (typeof BroadcastChannel === "undefined") return createNullPresence(self);
  const ch = new BroadcastChannel(`nx-wb-presence:${boardId}`);
  const peers = new Map<string, PresencePeer>();
  const listeners = new Set<(peers: PresencePeer[]) => void>();

  const emit = () => {
    const now = Date.now();
    for (const [id, p] of peers) if (now - p.updatedAt > STALE_MS) peers.delete(id);
    const list = [...peers.values()];
    listeners.forEach((cb) => cb(list));
  };
  const post = (m: Msg) => { try { ch.postMessage(m); } catch { /* channel closed */ } };

  ch.onmessage = (ev: MessageEvent<Msg>) => {
    const m = ev.data;
    if (!m) return;
    if (m.kind === "bye") { peers.delete(m.id); emit(); return; }
    if (m.peer.id === self.id) return; // ignore echoes of ourselves
    peers.set(m.peer.id, { ...m.peer, updatedAt: Date.now() });
    if (m.kind === "hello") post({ kind: "state", peer: self }); // answer a newcomer
    emit();
  };

  self.updatedAt = Date.now();
  post({ kind: "hello", peer: self });
  const hb = setInterval(() => { self.updatedAt = Date.now(); post({ kind: "heartbeat", peer: self }); emit(); }, HEARTBEAT_MS);

  return {
    self,
    subscribe(cb) { listeners.add(cb); cb([...peers.values()]); return () => listeners.delete(cb); },
    broadcastPointer(p) { self.pointer = p; self.updatedAt = Date.now(); post({ kind: "state", peer: self }); },
    broadcastSelection(ids) { self.selectedIds = ids; self.updatedAt = Date.now(); post({ kind: "state", peer: self }); },
    dispose() { clearInterval(hb); post({ kind: "bye", id: self.id }); try { ch.close(); } catch { /* already closed */ } },
  };
}

/* a provider that does nothing (SSR, or presence disabled) */
export function createNullPresence(self: PresencePeer): WhiteboardPresence {
  return {
    self,
    subscribe() { return () => {}; },
    broadcastPointer() {},
    broadcastSelection() {},
    dispose() {},
  };
}

let peerSeq = 0;
export function makeSelfPeer(username: string): PresencePeer {
  return {
    id: `${Date.now().toString(36)}-${(peerSeq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    username,
    color: randomPeerColor(),
    updatedAt: Date.now(),
  };
}
