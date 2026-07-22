import type { DeckSnapshot, Slide, SlideElement, ViewEvent } from "./types";
import { uid } from "./types";

/* A free-surface presentation persists as ONE snapshot blob under an app-state
   key — NOT record data. Namespaced so several standalone deck pages coexist. */
export const PRESENTATION_STORE_PREFIX = "presentation:";
export const presentationStoreKey = (pageKey: string): string =>
  `${PRESENTATION_STORE_PREFIX}${pageKey}`;

/* A stored value is a usable deck only if it carries the minimal shape; a
   missing/foreign/corrupt blob fails this and the surface recovers by seeding. */
export function isDeckSnapshot(x: unknown): x is DeckSnapshot {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return (
    d.kind === "deck" &&
    d.version === 1 &&
    typeof d.id === "string" &&
    typeof d.title === "string" &&
    Array.isArray(d.slides) &&
    typeof d.sharing === "object" &&
    d.sharing !== null &&
    typeof d.analytics === "object" &&
    d.analytics !== null
  );
}

export function createSlide(layout: Slide["layout"] = "title-body"): Slide {
  return { id: `sl-${uid()}`, layout, blocks: {}, notes: "", transition: "fade" };
}

/* Fold a viewer analytics event into the snapshot (pure). The host persists the
   returned snapshot through the app's data seam. */
export function applyViewEvent(deck: DeckSnapshot, event: ViewEvent): DeckSnapshot {
  const sessions = deck.analytics.sessions.slice();
  if (event.type === "session_start") {
    if (!sessions.some((s) => s.id === event.sessionId)) {
      sessions.push({
        id: event.sessionId,
        linkId: event.linkId,
        viewerEmail: event.viewerEmail,
        startedAt: event.at,
        slideMs: {},
        maxSlideIndex: 0,
        completed: false,
      });
    }
    return { ...deck, analytics: { sessions } };
  }
  const i = sessions.findIndex((s) => s.id === event.sessionId);
  if (i < 0) return deck;
  const s = { ...sessions[i], slideMs: { ...sessions[i].slideMs } };
  if (event.type === "slide_time") {
    s.slideMs[event.slideId] = (s.slideMs[event.slideId] ?? 0) + event.ms;
    s.maxSlideIndex = Math.max(s.maxSlideIndex, event.slideIndex);
  } else if (event.type === "session_complete") {
    s.completed = true;
  }
  sessions[i] = s;
  return { ...deck, analytics: { sessions } };
}

const B = (s: string) => s; // readability marker for HTML block content below

/* seedDeck — the flagship demo AND the deterministic journey fixture: a real
   10-slide product narrative ("Atlas — quarterly business review") exercising
   every layout, rich text, an image slide, speaker notes on every slide, mixed
   transitions, plus a seeded share link and two view sessions so the analytics
   panel is alive on first open. */
export function seedDeck(): DeckSnapshot {
  /* free-placement element helper for the seeded diagram slide */
  let elN = 0;
  const el = (e: Omit<SlideElement, "id">): SlideElement => ({ id: `el-seed-${++elN}`, ...e });

  const s = (
    layout: Slide["layout"],
    blocks: Slide["blocks"],
    notes: string,
    transition: Slide["transition"] = "fade",
    elements?: SlideElement[],
  ): Slide => ({ id: `sl-${uid()}`, layout, blocks, notes, transition, elements });

  const slides: Slide[] = [
    s(
      "title",
      {
        title: "Atlas Q2 Business Review",
        subtitle: "Growth, retention and the road to self-serve · June 2026",
      },
      "Welcome everyone. One headline before we dive in: best net-revenue quarter since launch.",
      "none",
    ),
    s(
      "section",
      { title: "Where we are" },
      "Section 1 of 3. Keep this under a minute.",
      "zoom",
    ),
    s(
      "title-body",
      {
        title: "Q2 at a glance",
        body: B(
          "<ul><li><b>ARR $4.2M</b>, up 18% quarter over quarter</li><li>Net revenue retention <b>117%</b> (was 109%)</li><li>Churn down to <b>1.4%</b> monthly — best ever</li><li>Two enterprise logos closed: <i>Meridian Bank</i> and <i>Northwind Logistics</i></li></ul>",
        ),
      },
      "Pause on NRR — the expansion motion is finally working. Meridian took 9 months; Northwind took 6 weeks.",
    ),
    s(
      "two-column",
      {
        title: "What worked vs. what didn't",
        left: B(
          "<b>Worked</b><ul><li>Usage-based pricing pilot: +23% expansion</li><li>Onboarding rebuild: time-to-value 9d → 3d</li><li>Partner-sourced pipeline doubled</li></ul>",
        ),
        right: B(
          "<b>Didn't</b><ul><li>Outbound reply rates fell below 1%</li><li>EU data-residency blocked 3 deals</li><li>Mobile app reviews slid to 3.6★</li></ul>",
        ),
      },
      "Be honest on the right column — the EU residency issue is the single biggest revenue blocker.",
    ),
    s(
      "image",
      {
        title: "Retention cohorts, 12 months",
        imageUrl:
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 420'><rect width='800' height='420' fill='#f4f4f6'/><g font-family='sans-serif'><text x='40' y='48' font-size='20' fill='#333'>Monthly retention by signup cohort</text>${[0, 1, 2, 3, 4, 5]
              .map((i) => {
                const h = 240 - i * 28;
                return `<rect x='${80 + i * 115}' y='${360 - h}' width='72' height='${h}' rx='6' fill='hsl(${210 + i * 6} 60% ${46 + i * 5}%)'/><text x='${86 + i * 115}' y='385' font-size='14' fill='#555'>M${i + 1}</text>`;
              })
              .join("")}</g></svg>`,
          ),
        caption: "Cohorts after the onboarding rebuild (M4+) hold ~12pts higher.",
      },
      "The chart is illustrative — the live dashboard link is in the appendix.",
    ),
    s(
      "quote",
      {
        quote:
          "Atlas is the first tool our ops team opens in the morning and the last one they close.",
        attribution: "Dana Whitfield · VP Operations, Northwind Logistics",
      },
      "Read the quote out loud, then pause. This is the enterprise story in one line.",
      "slide",
    ),
    s("section", { title: "Where we're going" }, "Section 2 — the plan.", "zoom"),
    s(
      "title-body",
      {
        title: "H2 priorities",
        body: B(
          "<ol><li><b>EU data residency</b> — Frankfurt region GA by September</li><li><b>Self-serve tier</b> — credit-card signup, usage-metered</li><li><b>Mobile quality bar</b> — crash-free sessions ≥ 99.7%</li></ol><p>Everything else is explicitly <i>not</i> a priority this half.</p>",
        ),
      },
      "If pressed on roadmap items outside these three: the answer is 'H1 next year'.",
    ),
    s(
      "title-body",
      { title: "How the three land", body: "<b>Sequenced, not parallel</b> — each gate unlocks the next" },
      "Walk the arrows left to right. The callout is the dependency people always ask about.",
      "fade",
      [
        el({ kind: "shape", shape: "roundRect", x: 96, y: 300, w: 300, h: 150, rot: 0, html: "EU residency<br><b>September</b>", style: { fill: "var(--pres-accent)", stroke: "none", strokeWidth: 0, opacity: 1, radius: 20, color: "#ffffff", fontSize: 26, align: "center", valign: "middle" } }),
        el({ kind: "shape", shape: "arrow", x: 412, y: 366, w: 90, h: 20, rot: 0, style: { fill: "var(--pres-muted)", stroke: "none", strokeWidth: 0, opacity: 1 } }),
        el({ kind: "shape", shape: "roundRect", x: 518, y: 300, w: 300, h: 150, rot: 0, html: "Self-serve tier<br><b>October</b>", style: { fill: "var(--pres-accent)", stroke: "none", strokeWidth: 0, opacity: 0.82, radius: 20, color: "#ffffff", fontSize: 26, align: "center", valign: "middle" } }),
        el({ kind: "shape", shape: "arrow", x: 834, y: 366, w: 90, h: 20, rot: 0, style: { fill: "var(--pres-muted)", stroke: "none", strokeWidth: 0, opacity: 1 } }),
        el({ kind: "shape", shape: "roundRect", x: 940, y: 300, w: 244, h: 150, rot: 0, html: "Mobile 99.7%<br><b>November</b>", style: { fill: "none", stroke: "var(--pres-accent)", strokeWidth: 3, opacity: 1, radius: 20, color: "var(--pres-fg)", fontSize: 26, align: "center", valign: "middle" } }),
        el({ kind: "shape", shape: "callout", x: 96, y: 486, w: 420, h: 150, rot: 0, html: "Self-serve can't ship before Frankfurt is GA.", style: { fill: "var(--pres-muted)", stroke: "none", strokeWidth: 0, opacity: 1, fillOpacity: 0.16, radius: 18, color: "var(--pres-fg)", fontSize: 22, align: "center", valign: "middle" } }),
      ],
    ),
    s(
      "title-body",
      { title: "Revenue by quarter", body: "<b>+35% YoY</b> on average — Q4 is a forecast, not a close." },
      "The bar chart is live data on the slide — the table under it is the same numbers, exactly as finance sent them.",
      "fade",
      [
        el({
          kind: "chart",
          x: 76, y: 246, w: 700, h: 350, rot: 0,
          style: { opacity: 1, fontSize: 13 },
          chart: {
            type: "bar",
            series: ["2025", "2026"],
            rows: [
              { label: "Q1", values: [2.9, 3.6] },
              { label: "Q2", values: [3.1, 4.2] },
              { label: "Q3", values: [3.4, 4.6] },
              { label: "Q4", values: [3.5, 5.1] },
            ],
            showLegend: true,
            showGrid: true,
          },
        }),
        el({
          kind: "table",
          x: 812, y: 262, w: 400, h: 300, rot: 0,
          style: { opacity: 1, fontSize: 19, color: "var(--pres-fg)" },
          table: {
            headerRow: true,
            rows: [
              [{ text: "Quarter" }, { text: "ARR" }, { text: "YoY" }],
              [{ text: "Q1" }, { text: "$3.6M" }, { text: "+24%" }],
              [{ text: "Q2" }, { text: "$4.2M" }, { text: "+35%" }],
              [{ text: "Q3" }, { text: "$4.6M" }, { text: "+35%" }],
              [{ text: "Q4e" }, { text: "$5.1M" }, { text: "+46%" }],
            ],
          },
        }),
      ],
    ),
    s(
      "two-column",
      {
        title: "Asks",
        left: B(
          "<b>From finance</b><ul><li>Approve 2 infra hires for the EU region</li><li>Q3 marketing budget +15%</li></ul>",
        ),
        right: B(
          "<b>From the board</b><ul><li>Intro to 2 EU enterprise design partners</li><li>Pricing committee seat for self-serve launch</li></ul>",
        ),
      },
      "End on the asks and stop talking. Do not fill the silence.",
    ),
    s(
      "title",
      { title: "Thank you", subtitle: "Questions → dana@atlas.dev · Deck shared via the link you received" },
      "Leave this up during Q&A.",
      "fade",
    ),
  ];

  const linkId = `lnk-${uid()}`;
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const sess = (
    email: string | undefined,
    msAgo: number,
    upTo: number,
    completed: boolean,
  ) => {
    const slideMs: Record<string, number> = {};
    for (let i = 0; i <= upTo && i < slides.length; i++) {
      slideMs[slides[i].id] = 4000 + ((i * 2654435761) % 26000);
    }
    return {
      id: `vs-${uid()}`,
      linkId,
      viewerEmail: email,
      startedAt: iso(msAgo),
      slideMs,
      maxSlideIndex: Math.min(upTo, slides.length - 1),
      completed,
    };
  };

  return {
    kind: "deck",
    version: 1,
    id: `deck-${uid()}`,
    title: "Atlas Q2 Business Review",
    theme: "native",
    slides,
    sharing: {
      links: [
        {
          id: linkId,
          slug: "atlas-q2-review",
          label: "Board pre-read",
          createdAt: iso(3 * 864e5),
          expiresAt: null,
          emailGate: true,
        },
      ],
    },
    analytics: {
      sessions: [sess("li.chen@meridianbank.com", 2 * 864e5, 9, true), sess("s.okafor@nw-logistics.com", 864e5, 4, false)],
    },
    rooms: [
      {
        id: `room-${uid()}`,
        name: "Board pack · June 2026",
        createdAt: iso(3 * 864e5),
        items: [
          { id: `ri-${uid()}`, kind: "this-deck", title: "Atlas Q2 Business Review" },
          { id: `ri-${uid()}`, kind: "link", title: "Financial model (workbook)", href: "#" },
          { id: `ri-${uid()}`, kind: "link", title: "Product roadmap (document)", href: "#" },
        ],
      },
    ],
  };
}
