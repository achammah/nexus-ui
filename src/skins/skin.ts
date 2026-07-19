/* Skin engine — a SMALL brand description in, the FULL --nx-* token set out.
   Three altitudes of control, all optional, all composable:
     1. derivation  — give `brand.primary` and every accent state (hover, soft,
        dark-mode ramp) is derived via color-mix; give `ink` and the fg ramp follows
     2. named knobs — chrome (shell region), radius personality, fonts, labels,
        density, shadows, motion, semantic palette
     3. raw overrides — `overrides.light/dark` sets ANY --nx-* token directly
   Unspecified fields emit NOTHING, so the token-canvas defaults keep holding.
   Zero-dep: derivation compiles to CSS color-mix(), not JS color math. */

export interface Skin {
  name: string;
  brand?: { primary: string; primaryHover?: string; onPrimary?: string };
  /* base foreground; muted/faint steps derive from it */
  ink?: string;
  surfaces?: { bg?: string; card?: string; sunken?: string; border?: string; borderStrong?: string };
  /* the shell region (sidebar/nav): light = content-like (default), dark/brand = flipped */
  chrome?: { style?: "light" | "dark" | "brand"; bg?: string; fg?: string; accent?: string };
  semantic?: { ok?: string; warn?: string; danger?: string };
  font?: { sans?: string; mono?: string };
  /* micro-label treatment: uppercase (tracked) or sentence case */
  labels?: "uppercase" | "normal";
  /* number = one radius personality knob (0 → fully squared); object = exact px */
  radius?: number | { s: number; m: number; l: number };
  density?: "comfortable" | "compact";
  shadow?: "soft" | "flat";
  motion?: { ease?: string; fast?: string; med?: string };
  /* consumed by the app shell (not CSS): brand mark + wordmark */
  logo?: { mark?: string; markBg?: string; markFg?: string; wordmark?: string; wordmarkAccent?: string; url?: string };
  /* dark mode: "auto" (derived) or explicit token overrides via overrides.dark */
  overrides?: { light?: Record<string, string>; dark?: Record<string, string> };
}

const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

function varsFor(skin: Skin): { light: Record<string, string>; dark: Record<string, string> } {
  const L: Record<string, string> = {};
  const D: Record<string, string> = {};

  const p = skin.brand?.primary;
  if (p) {
    L["--nx-accent"] = p;
    L["--nx-accent-fg"] = skin.brand?.onPrimary ?? "#ffffff";
    L["--nx-accent-hover"] = skin.brand?.primaryHover ?? mix(p, 88, "#000");
    L["--nx-accent-soft"] = mix(p, 11, "var(--nx-bg-raised)");
    D["--nx-accent"] = mix(p, 74, "#ffffff");
    D["--nx-accent-fg"] = "#101013";
    D["--nx-accent-hover"] = mix(p, 60, "#ffffff");
    D["--nx-accent-soft"] = mix(p, 20, "#17171a");
  }

  if (skin.ink) {
    L["--nx-fg"] = skin.ink;
    L["--nx-fg-muted"] = mix(skin.ink, 62, "var(--nx-bg)");
    L["--nx-fg-faint"] = mix(skin.ink, 40, "var(--nx-bg)");
  }

  const s = skin.surfaces ?? {};
  if (s.bg) L["--nx-bg"] = s.bg;
  if (s.card) L["--nx-bg-raised"] = s.card;
  if (s.sunken) L["--nx-bg-sunken"] = s.sunken;
  if (s.border) L["--nx-border"] = s.border;
  if (s.borderStrong) L["--nx-border-strong"] = s.borderStrong;

  const sem = skin.semantic ?? {};
  for (const [key, val] of [["ok", sem.ok], ["warn", sem.warn], ["danger", sem.danger]] as const) {
    if (!val) continue;
    L[`--nx-${key}`] = val;
    L[`--nx-${key}-soft`] = mix(val, 12, "var(--nx-bg-raised)");
    D[`--nx-${key}`] = mix(val, 72, "#ffffff");
    D[`--nx-${key}-soft`] = mix(val, 18, "#17171a");
  }

  if (skin.font?.sans) L["--nx-font-sans"] = skin.font.sans;
  if (skin.font?.mono) L["--nx-font-mono"] = skin.font.mono;

  if (skin.radius !== undefined) {
    const r = typeof skin.radius === "number"
      ? { s: Math.round(6 * skin.radius), m: Math.round(9 * skin.radius), l: Math.round(14 * skin.radius) }
      : skin.radius;
    L["--nx-radius-s"] = `${r.s}px`;
    L["--nx-radius-m"] = `${r.m}px`;
    L["--nx-radius-l"] = `${r.l}px`;
  }

  if (skin.labels) {
    L["--nx-label-transform"] = skin.labels === "uppercase" ? "uppercase" : "none";
    L["--nx-label-tracking"] = skin.labels === "uppercase" ? "0.06em" : "0.01em";
  }

  if (skin.density === "compact") {
    L["--nx-gap-1"] = "3px"; L["--nx-gap-2"] = "6px"; L["--nx-gap-3"] = "9px";
    L["--nx-gap-4"] = "12px"; L["--nx-gap-5"] = "18px";
  }

  if (skin.shadow === "flat") {
    L["--nx-shadow-1"] = "0 1px 2px rgb(0 0 0 / 0.05)";
    L["--nx-shadow-2"] = "0 2px 8px rgb(0 0 0 / 0.08)";
  }

  if (skin.motion?.ease) L["--nx-ease"] = skin.motion.ease;
  if (skin.motion?.fast) L["--nx-t-fast"] = skin.motion.fast;
  if (skin.motion?.med) L["--nx-t-med"] = skin.motion.med;

  const chrome = skin.chrome;
  if (chrome && chrome.style && chrome.style !== "light") {
    const bg = chrome.bg ?? (chrome.style === "brand" && p ? p : "#0b0b0b");
    const fg = chrome.fg ?? "#ffffff";
    const accent = chrome.accent ?? p ?? "var(--nx-accent)";
    const set = (m: Record<string, string>) => {
      m["--nx-chrome-bg"] = bg;
      m["--nx-chrome-fg"] = fg;
      m["--nx-chrome-fg-muted"] = mix(fg, 68, bg);
      m["--nx-chrome-fg-faint"] = mix(fg, 46, bg);
      m["--nx-chrome-border"] = mix(fg, 14, bg);
      m["--nx-chrome-active-bg"] = mix(fg, 10, bg);
      m["--nx-chrome-accent"] = accent;
    };
    set(L); set(D);
  }

  Object.assign(L, skin.overrides?.light ?? {});
  Object.assign(D, skin.overrides?.dark ?? {});
  return { light: L, dark: D };
}

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return body ? `${selector} {\n${body}\n}` : "";
}

export function skinToCss(skin: Skin): string {
  const { light, dark } = varsFor(skin);
  return [
    `/* skin: ${skin.name} */`,
    block(":root", light),
    Object.keys(dark).length ? `@media (prefers-color-scheme: dark) {\n${block(":root", dark)}\n}` : "",
    block(':root[data-theme="light"]', light),
    block(':root[data-theme="dark"]', dark),
  ].filter(Boolean).join("\n");
}

/* Upserts a <style id="nx-skin"> tag + caches the CSS so the NEXT boot can inject
   it before first paint (see the starter's main.tsx) — no flash after first load. */
export function applySkin(skin: Skin, doc: Document = document): void {
  const css = skinToCss(skin);
  let el = doc.getElementById("nx-skin") as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement("style");
    el.id = "nx-skin";
    doc.head.appendChild(el);
  }
  el.textContent = css;
  try { localStorage.setItem("nx-skin-css", css); } catch { /* private mode */ }
}
