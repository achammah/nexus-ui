import * as React from "react";
import { LayoutGrid } from "lucide-react";
import type { ViewDefinition } from "../types";
import { activeFields } from "../../options";

/* Gallery view — a cover-card masonry over the object's rows. Config keys:
   `coverField` (a url field rendered as the card cover; missing/broken values
   fall back to an initials placeholder) · `titleField` (defaults to the
   primary) · `metaFields` (≤3 keys rendered under the title; select values as
   colored chips) · `cardSize` ("s" | "m" | "l" column width). The component is
   lazy — the view code stays out of the eager chunk. */

const GalleryView = React.lazy(() => import("./GalleryView"));

const definition: ViewDefinition = {
  type: "gallery",
  label: "Gallery",
  icon: <LayoutGrid size={13} />,
  component: GalleryView,
  configSchema: [
    { key: "coverField", label: "Cover", kind: "field", fieldTypes: ["url"] },
    { key: "titleField", label: "Title", kind: "field" },
    { key: "metaFields", label: "Meta fields", kind: "text" },
    { key: "cardSize", label: "Card size", kind: "select", options: ["s", "m", "l"] },
  ],
  defaultConfig: (object) => ({
    coverField: activeFields(object.fields).find((f) => f.type === "url")?.key,
    metaFields: activeFields(object.fields)
      .filter((f) => !f.primary)
      .slice(0, 2)
      .map((f) => f.key),
  }),
  validateConfig: (object, cfg) => {
    const fields = activeFields(object.fields);
    const cover = cfg.coverField;
    if (typeof cover === "string" && cover !== "") {
      const f = fields.find((x) => x.key === cover);
      if (!f) return `coverField “${cover}” is not a field of ${object.key}`;
      if (f.type !== "url") return `coverField “${cover}” must be a url field`;
    }
    const title = cfg.titleField;
    if (typeof title === "string" && title !== "" && !fields.some((x) => x.key === title))
      return `titleField “${title}” is not a field of ${object.key}`;
    const meta = cfg.metaFields;
    if (meta !== undefined) {
      if (!Array.isArray(meta)) return "metaFields must be a list of field keys";
      if (meta.length > 3) return "metaFields shows at most 3 fields";
      const bad = (meta as unknown[]).find((k) => !fields.some((x) => x.key === String(k)));
      if (bad !== undefined) return `metaFields “${String(bad)}” is not a field of ${object.key}`;
    }
    return null;
  },
};

export default definition;
