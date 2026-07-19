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

export const skinPresets: Record<string, Skin> = {
  nexus: nexusSkin,
  ember: emberSkin,
};
