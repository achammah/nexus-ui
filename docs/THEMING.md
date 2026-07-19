# Theming — skins (brand as data)

One small JSON re-brands everything: record-core surfaces, the app shell, and all vendored shadcn components (they read the same tokens through `src/styles/shadcn.css`). Three altitudes of control, all optional, all composable — give as little as one color, or override any token.

## Quick start

```ts
import { applySkin } from "nexus-ui/skins/skin";

applySkin({
  name: "acme",
  brand: { primary: "#0B6E4F" },
});
```

That alone derives the full accent ramp (hover, soft tint, focus ring, dark-mode variant) via CSS `color-mix`. Everything not specified keeps the token-canvas default.

## The full knob set

```jsonc
{
  "name": "acme",
  "brand": { "primary": "#0B6E4F", "primaryHover": "#095C42", "onPrimary": "#ffffff" },
  "ink": "#141414",                          // base text; muted/faint steps derive
  "surfaces": { "bg": "#FAFAF9", "card": "#fff", "sunken": "#F2F1EF", "border": "#E8E6E3" },
  "chrome": { "style": "dark", "bg": "#000", "accent": "#0B6E4F" },  // the shell region: light | dark | brand
  "semantic": { "ok": "#1B7F4D", "warn": "#C77700", "danger": "#C43A31" },
  "font": { "sans": "\"Helvetica Neue\", Helvetica, Arial, sans-serif" },
  "labels": "uppercase",                     // micro-label treatment (tracked caps vs sentence case)
  "radius": 0,                               // one personality knob (0 = fully squared) — or {"s":6,"m":9,"l":14}
  "density": "compact",
  "shadow": "flat",
  "motion": { "ease": "cubic-bezier(.16,1,.3,1)" },
  "logo": { "mark": "■", "markBg": "#0B6E4F", "markFg": "#fff", "wordmark": "Acme", "wordmarkAccent": "Shops" },
  "overrides": {                             // the escape hatch: ANY --nx-* token, per mode
    "light": { "--nx-warn-soft": "#FFF4E0" },
    "dark":  { "--nx-bg": "#0E0E10" }
  }
}
```

- **Dark mode is derived** from the same brand (lightened accent, tinted softs) unless `overrides.dark` says otherwise. The viewer's `[data-theme]` stamp keeps working.
- **`chrome`** styles the shell region (sidebar/nav) independently of content surfaces — a black or brand-colored shell is a one-line identity move.
- **`radius` reaches the vendored kit**: the shadcn `--radius` variables are bridged to `--nx-radius-*`, so dialogs, buttons, inputs, and popovers all follow.
- **`logo`** is consumed by the app shell (mark glyph or image URL, solid mark background, two-tone wordmark).

## Mechanics

`skinToCss(skin)` compiles the JSON to a CSS string (`:root` + light/dark blocks, derivations as `color-mix(in oklab, …)` — no JS color math, no dependencies). `applySkin(skin)` upserts a `<style id="nx-skin">` tag and caches the CSS in `localStorage("nx-skin-css")` so the host app can inject it before first paint on the next visit.

Built-ins live in `src/skins/presets.ts`: `nexus` (the house identity) and `ember` (a full-range org example: dark chrome, sharp corners, its own palette and type — the fidelity benchmark for "an organisation's own skin").

Consumers (the starter pattern): `theme.skin` (inline object) > `theme.skinPreset` (built-in name) > `theme.accent` (one-knob shortcut), applied on config load.

Static theming still works: tokens.css remains the canvas, and an app's design lock may edit it directly. Skins are the RUNTIME layer on top — same tokens, data-driven.
