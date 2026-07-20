import type { Skin } from "./skin";

/* Built-in skins. `nexus` IS the token canvas's own identity (it emits nothing the
   defaults don't already say — shipping it as data makes the identity portable and
   editable). `ember` demonstrates the full knob range an organisation brand needs:
   dark chrome, squared corners, its own type + semantic palette, flat elevation. */

export const nexusSkin: Skin = {
  name: "nexus",
  brand: { primary: "#4f46e5" },
  logo: { mark: "N", wordmark: "Nexus" },
};

export const emberSkin: Skin = {
  name: "ember",
  brand: { primary: "#FF7900", primaryHover: "#F16E00", onPrimary: "#141414" },
  ink: "#141414",
  chrome: { style: "dark", bg: "#000000", accent: "#FF7900" },
  semantic: { ok: "#1B7F4D", warn: "#C77700", danger: "#C43A31" },
  font: { sans: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  labels: "uppercase",
  radius: 0,
  shadow: "flat",
  motion: { ease: "cubic-bezier(.16,1,.3,1)" },
  logo: { mark: "■", markBg: "#FF7900", markFg: "#000000" },
};

/* Warm option-chip palette — the 9 select/multiselect/kanban chip colors, warmed
   (indigo/amber/terracotta family). A SKIN-OVERRIDABLE preset only: the default token
   palette (cool) is unchanged. Light-mode override only; dark keeps the shared ramp.
   Compose it into a brand skin via `overrides.light`, or use the `warm-opt` preset. */
export const warmOptPalette: Record<string, string> = {
  "--nx-opt-gray": "#6B6860", "--nx-opt-blue": "#5A47F5", "--nx-opt-green": "#1E8A4E",
  "--nx-opt-yellow": "#B67A00", "--nx-opt-orange": "#C4632A", "--nx-opt-red": "#C0392B",
  "--nx-opt-purple": "#6B4FC4", "--nx-opt-pink": "#C43C86", "--nx-opt-teal": "#1C8FA8",
};

export const warmOptSkin: Skin = {
  name: "warm-opt",
  overrides: { light: warmOptPalette },
};

export const skinPresets: Record<string, Skin> = {
  nexus: nexusSkin,
  ember: emberSkin,
  "warm-opt": warmOptSkin,
};
