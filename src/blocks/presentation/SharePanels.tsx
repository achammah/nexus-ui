import * as React from "react";
import { Copy, Eye, Plus, Trash2 } from "lucide-react";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import type { DataRoom, DeckSnapshot, PresentationConfig, ShareLink } from "./types";
import { uid } from "./types";
import { textOf } from "./SlideView";

const defaultShareUrl = (slug: string): string =>
  /* CONFIG SEAM — real deployments override PresentationConfig.buildShareUrl with
     their viewer route; this default targets a hash route on the current page. */
  `${location.origin}${location.pathname}#/share/${slug}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
const fmtMs = (ms: number) => (ms >= 60000 ? `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`);

/* ---- Share links ---- */

export function SharePanel({
  deck,
  onChange,
  config,
  onOpenViewer,
}: {
  deck: DeckSnapshot;
  onChange: (d: DeckSnapshot) => void;
  config?: PresentationConfig;
  /* editor-side preview of what the recipient sees */
  onOpenViewer: (slug: string) => void;
}) {
  const buildUrl = config?.buildShareUrl ?? defaultShareUrl;
  const [copied, setCopied] = React.useState<string | null>(null);
  const patch = (id: string, p: Partial<ShareLink>) =>
    onChange({
      ...deck,
      sharing: { links: deck.sharing.links.map((l) => (l.id === id ? { ...l, ...p } : l)) },
    });

  const create = () => {
    const slug = `${deck.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "deck"}-${uid().slice(0, 4)}`;
    onChange({
      ...deck,
      sharing: {
        links: [
          ...deck.sharing.links,
          { id: `lnk-${uid()}`, slug, label: `Link ${deck.sharing.links.length + 1}`, createdAt: new Date().toISOString(), expiresAt: null, emailGate: false },
        ],
      },
    });
  };

  return (
    <section className="nxPresPanel" data-testid="share-panel">
      <header className="nxPresPanelHead">
        <h3 className="nxPresPanelTitle">Share links</h3>
        <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={create}>
          New link
        </Button>
      </header>
      {deck.sharing.links.length === 0 && (
        <p className="nxPresPanelEmpty">No links yet. Create one to share this deck read-only and track who views it.</p>
      )}
      {deck.sharing.links.map((l) => {
        const url = buildUrl(l.slug);
        const expired = !!l.expiresAt && Date.now() > Date.parse(l.expiresAt);
        const views = deck.analytics.sessions.filter((s) => s.linkId === l.id).length;
        return (
          <div key={l.id} className={`nxPresLinkRow${l.disabled || expired ? " isOff" : ""}`}>
            <div className="nxPresLinkMain">
              <input
                className="nxPresInlineInput nxPresLinkLabel"
                value={l.label ?? ""}
                placeholder="Label"
                onChange={(e) => patch(l.id, { label: e.target.value })}
                aria-label="Link label"
              />
              <code className="nxPresLinkUrl" title={url}>
                {url}
              </code>
              <div className="nxPresLinkMeta">
                created {fmtDate(l.createdAt)} · {views} view{views === 1 ? "" : "s"}
                {expired && <span className="nxPresTagWarn">expired</span>}
                {l.disabled && <span className="nxPresTagWarn">off</span>}
              </div>
            </div>
            <div className="nxPresLinkCtl">
              <Button
                size="sm"
                variant="ghost"
                icon={<Copy size={13} />}
                onClick={() => {
                  navigator.clipboard?.writeText(url).catch(() => undefined);
                  setCopied(l.id);
                  setTimeout(() => setCopied((c) => (c === l.id ? null : c)), 1500);
                }}
              >
                {copied === l.id ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" icon={<Eye size={13} />} onClick={() => onOpenViewer(l.slug)}>
                Preview
              </Button>
              <label className="nxPresCheck">
                <input type="checkbox" checked={!!l.emailGate} onChange={(e) => patch(l.id, { emailGate: e.target.checked })} />
                Email gate
              </label>
              <label className="nxPresCheck">
                expires
                <input
                  type="date"
                  className="nxPresInlineInput"
                  value={l.expiresAt ? l.expiresAt.slice(0, 10) : ""}
                  onChange={(e) => patch(l.id, { expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null })}
                  aria-label="Expiry date"
                />
              </label>
              <label className="nxPresCheck">
                <input type="checkbox" checked={!l.disabled} onChange={(e) => patch(l.id, { disabled: !e.target.checked })} />
                active
              </label>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ---- View analytics ---- */

export function AnalyticsPanel({ deck }: { deck: DeckSnapshot }) {
  const { sessions } = deck.analytics;
  const slideIds = deck.slides.map((s) => s.id);
  const perSlide = slideIds.map((id, i) => {
    const totals = sessions.map((s) => s.slideMs[id] ?? 0).filter((n) => n > 0);
    const reached = sessions.filter((s) => s.maxSlideIndex >= i).length;
    return {
      id,
      index: i,
      title: textOf(deck.slides[i].blocks.title) || textOf(deck.slides[i].blocks.quote) || `Slide ${i + 1}`,
      avgMs: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0,
      reached,
    };
  });
  const maxAvg = Math.max(1, ...perSlide.map((p) => p.avgMs));
  const completion = sessions.length ? Math.round((sessions.filter((s) => s.completed).length / sessions.length) * 100) : 0;

  return (
    <section className="nxPresPanel" data-testid="analytics-panel">
      <header className="nxPresPanelHead">
        <h3 className="nxPresPanelTitle">Viewer analytics</h3>
        <span className="nxPresPanelStat">
          {sessions.length} session{sessions.length === 1 ? "" : "s"} · {completion}% completed
        </span>
      </header>
      {sessions.length === 0 ? (
        <p className="nxPresPanelEmpty">No views yet — share a link and analytics land here per viewer and per slide.</p>
      ) : (
        <>
          <div className="nxPresAnaGrid" role="table" aria-label="Time per slide">
            {perSlide.map((p) => (
              <div key={p.id} className="nxPresAnaRow" role="row">
                <span className="nxPresAnaIdx">{p.index + 1}</span>
                <span className="nxPresAnaTitle" title={p.title}>
                  {p.title}
                </span>
                <span className="nxPresAnaBarWell">
                  <span className="nxPresAnaBar" style={{ width: `${(p.avgMs / maxAvg) * 100}%` }} />
                </span>
                <span className="nxPresAnaMs">{p.avgMs ? fmtMs(p.avgMs) : "—"}</span>
                <span className="nxPresAnaReach">{p.reached}/{sessions.length} reached</span>
              </div>
            ))}
          </div>
          <h4 className="nxPresPanelSub">Sessions</h4>
          {sessions
            .slice()
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .map((s) => {
              const link = deck.sharing.links.find((l) => l.id === s.linkId);
              const total = Object.values(s.slideMs).reduce((a, b) => a + b, 0);
              return (
                <div key={s.id} className="nxPresSessRow">
                  <span className="nxPresSessWho">{s.viewerEmail ?? "Anonymous"}</span>
                  <span className="nxPresSessMeta">
                    via {link?.label || link?.slug || "deleted link"} · {fmtDate(s.startedAt)} · {fmtMs(total)} ·
                    reached {s.maxSlideIndex + 1}/{deck.slides.length}
                  </span>
                  <span className={`nxPresTag${s.completed ? " nxPresTagOk" : ""}`}>{s.completed ? "completed" : "partial"}</span>
                </div>
              );
            })}
        </>
      )}
    </section>
  );
}

/* ---- Data rooms ---- */

export function RoomsPanel({ deck, onChange }: { deck: DeckSnapshot; onChange: (d: DeckSnapshot) => void }) {
  const patchRoom = (id: string, p: Partial<DataRoom>) =>
    onChange({ ...deck, rooms: deck.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  return (
    <section className="nxPresPanel" data-testid="rooms-panel">
      <header className="nxPresPanelHead">
        <h3 className="nxPresPanelTitle">Data rooms</h3>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus size={13} />}
          onClick={() =>
            onChange({
              ...deck,
              rooms: [
                ...deck.rooms,
                {
                  id: `room-${uid()}`,
                  name: `Room ${deck.rooms.length + 1}`,
                  createdAt: new Date().toISOString(),
                  items: [{ id: `ri-${uid()}`, kind: "this-deck", title: deck.title }],
                },
              ],
            })
          }
        >
          New room
        </Button>
      </header>
      <p className="nxPresPanelHint">
        A room bundles this deck with other decks/documents into one shared set. Items pointing at other pages are
        host-resolved references (the cross-page registry is an app seam).
      </p>
      {deck.rooms.map((room) => (
        <div key={room.id} className="nxPresRoom">
          <div className="nxPresRoomHead">
            <input
              className="nxPresInlineInput nxPresRoomName"
              value={room.name}
              onChange={(e) => patchRoom(room.id, { name: e.target.value })}
              aria-label="Room name"
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={13} />}
              onClick={() =>
                patchRoom(room.id, {
                  items: [...room.items, { id: `ri-${uid()}`, kind: "link", title: "New document", href: "#" }],
                })
              }
            >
              Add item
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => onChange({ ...deck, rooms: deck.rooms.filter((r) => r.id !== room.id) })}>
              Delete
            </Button>
          </div>
          <ul className="nxPresRoomItems">
            {room.items.map((it) => (
              <li key={it.id} className="nxPresRoomItem">
                <span className={`nxPresRoomKind nxPresRoomKind-${it.kind}`}>{it.kind === "this-deck" ? "deck" : "doc"}</span>
                <input
                  className="nxPresInlineInput"
                  value={it.title}
                  onChange={(e) =>
                    patchRoom(room.id, { items: room.items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)) })
                  }
                  aria-label="Item title"
                />
                {it.kind === "link" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={13} />}
                    onClick={() => patchRoom(room.id, { items: room.items.filter((x) => x.id !== it.id) })}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
