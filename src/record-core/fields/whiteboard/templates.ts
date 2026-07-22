/* Insertable board templates — starting structures a client drops onto the canvas
   (kanban lanes, a 2×2 matrix, a flowchart, a timeline, a mindmap). Each builder
   returns excalidraw element SKELETONS (convertToExcalidrawElements input); the caller
   converts them in the browser and drops them at the viewport centre. Config chooses
   which templates are offered (config.templates); a client may also inline its own.

   Pure — no excalidraw import (skeletons are plain objects). */

import type { BuiltinTemplateKey, InlineTemplate, TemplateRef } from "./config";

type Skeleton = Record<string, unknown>;
export interface ResolvedTemplate {
  key: string;
  label: string;
  skeletons: Skeleton[];
}

/* excalidraw pastel background set — legible on both themes */
const BG = { blue: "#a5d8ff", green: "#b2f2bb", yellow: "#ffec99", red: "#ffc9c9", violet: "#d0bfff", grey: "#e9ecef" };

const note = (x: number, y: number, text: string, bg: string, w = 150, h = 90): Skeleton => ({
  type: "rectangle",
  x,
  y,
  width: w,
  height: h,
  backgroundColor: bg,
  fillStyle: "solid",
  strokeColor: "#1e1e1e",
  strokeWidth: 1,
  roundness: { type: 3 },
  label: { text, fontSize: 16 },
});

const heading = (x: number, y: number, text: string, fontSize = 28): Skeleton => ({
  type: "text",
  x,
  y,
  text,
  fontSize,
  strokeColor: "#1e1e1e",
});

const hArrow = (x: number, y: number, w: number): Skeleton => ({
  type: "arrow",
  x,
  y,
  width: w,
  height: 0,
  strokeColor: "#495057",
  strokeWidth: 2,
  endArrowhead: "arrow",
});

function kanban(): Skeleton[] {
  const cols = [
    { t: "To do", bg: BG.grey, notes: ["Draft the brief", "Collect assets"] },
    { t: "In progress", bg: BG.blue, notes: ["Wire the API", "Design review"] },
    { t: "Done", bg: BG.green, notes: ["Kickoff call"] },
  ];
  const out: Skeleton[] = [];
  cols.forEach((c, i) => {
    const cx = i * 220;
    out.push({ type: "rectangle", x: cx, y: 0, width: 190, height: 460, backgroundColor: "transparent", strokeColor: "#adb5bd", strokeStyle: "dashed", strokeWidth: 1, roundness: { type: 3 } });
    out.push(heading(cx + 16, 14, c.t, 20));
    c.notes.forEach((n, j) => out.push(note(cx + 20, 60 + j * 110, n, c.bg, 150, 90)));
  });
  return out;
}

function matrix2x2(): Skeleton[] {
  const S = 440;
  return [
    { type: "line", x: 0, y: S / 2, width: S, height: 0, strokeColor: "#adb5bd", strokeWidth: 2 },
    { type: "line", x: S / 2, y: 0, width: 0, height: S, strokeColor: "#adb5bd", strokeWidth: 2 },
    heading(-4, -34, "Impact / Effort", 22),
    { type: "text", x: 30, y: 12, text: "Quick wins", fontSize: 16, strokeColor: "#2f9e44" },
    { type: "text", x: S / 2 + 30, y: 12, text: "Big bets", fontSize: 16, strokeColor: "#1971c2" },
    { type: "text", x: 30, y: S - 28, text: "Fill-ins", fontSize: 16, strokeColor: "#868e96" },
    { type: "text", x: S / 2 + 30, y: S - 28, text: "Time sinks", fontSize: 16, strokeColor: "#e03131" },
    note(60, 70, "Idea A", BG.green, 120, 64),
    note(S / 2 + 60, 70, "Idea B", BG.blue, 120, 64),
  ];
}

function flow(): Skeleton[] {
  return [
    { type: "ellipse", x: 0, y: 40, width: 120, height: 60, backgroundColor: BG.green, fillStyle: "solid", strokeColor: "#1e1e1e", label: { text: "Start", fontSize: 16 } },
    hArrow(126, 70, 54),
    note(186, 40, "Process", BG.blue, 130, 60),
    hArrow(322, 70, 54),
    { type: "diamond", x: 382, y: 20, width: 140, height: 100, backgroundColor: BG.yellow, fillStyle: "solid", strokeColor: "#1e1e1e", label: { text: "OK?", fontSize: 16 } },
    hArrow(528, 70, 54),
    { type: "ellipse", x: 588, y: 40, width: 120, height: 60, backgroundColor: BG.red, fillStyle: "solid", strokeColor: "#1e1e1e", label: { text: "End", fontSize: 16 } },
  ];
}

function timeline(): Skeleton[] {
  const out: Skeleton[] = [{ type: "line", x: 0, y: 60, width: 640, height: 0, strokeColor: "#495057", strokeWidth: 3 }];
  const marks = ["Q1 · Kickoff", "Q2 · Beta", "Q3 · Launch", "Q4 · Scale"];
  marks.forEach((m, i) => {
    const x = 40 + i * 190;
    out.push({ type: "ellipse", x: x - 8, y: 52, width: 16, height: 16, backgroundColor: "#1971c2", fillStyle: "solid", strokeColor: "#1971c2" });
    out.push({ type: "text", x: x - 30, y: i % 2 ? 82 : 20, text: m, fontSize: 15, strokeColor: "#1e1e1e" });
  });
  return out;
}

function mindmap(): Skeleton[] {
  const out: Skeleton[] = [
    { type: "ellipse", x: 250, y: 180, width: 160, height: 80, backgroundColor: BG.violet, fillStyle: "solid", strokeColor: "#1e1e1e", label: { text: "Topic", fontSize: 18 } },
  ];
  const branches = [
    { x: 20, y: 40, t: "Why", bg: BG.blue },
    { x: 500, y: 40, t: "What", bg: BG.green },
    { x: 20, y: 340, t: "Who", bg: BG.yellow },
    { x: 500, y: 340, t: "How", bg: BG.red },
  ];
  branches.forEach((b) => {
    out.push(note(b.x, b.y, b.t, b.bg, 130, 60));
    out.push({ type: "line", x: 330, y: 220, width: b.x + 65 - 330, height: b.y + 30 - 220, strokeColor: "#adb5bd", strokeWidth: 2 });
  });
  return out;
}

const BUILDERS: Record<BuiltinTemplateKey, { label: string; build: () => Skeleton[] }> = {
  kanban: { label: "Kanban board", build: kanban },
  matrix2x2: { label: "2×2 matrix", build: matrix2x2 },
  flow: { label: "Flowchart", build: flow },
  timeline: { label: "Timeline", build: timeline },
  mindmap: { label: "Mindmap", build: mindmap },
};

const isBuiltin = (r: TemplateRef): r is BuiltinTemplateKey => typeof r === "string" && r in BUILDERS;

export function resolveTemplate(ref: TemplateRef): ResolvedTemplate | null {
  if (isBuiltin(ref)) {
    const b = BUILDERS[ref];
    return { key: ref, label: b.label, skeletons: b.build() };
  }
  const t = ref as InlineTemplate;
  if (t && typeof t === "object" && Array.isArray(t.elements)) {
    return { key: t.key, label: t.label, skeletons: t.elements as Skeleton[] };
  }
  return null;
}

export const resolveTemplates = (refs: TemplateRef[]): ResolvedTemplate[] =>
  refs.map(resolveTemplate).filter((t): t is ResolvedTemplate => !!t);
