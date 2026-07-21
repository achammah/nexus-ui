import * as React from "react";
import { LayoutGrid } from "lucide-react";
import type { ViewDefinition, ViewToolbarProps } from "../types";
import { activeFields } from "../../options";
import { groupableFields, sortableFields } from "../group";
import { GroupByMenu, SortMenu } from "../controls";

/* Gallery view — a cover-card masonry over the object's rows. Config keys:
   `coverField` (a url/links/array field; the first image-like value is the cover,
   a missing/broken one falls back to an initials placeholder) · `coverFit`
   ("cover" default | "contain") · `titleField` (defaults to the primary) ·
   `cardFields` (ordered field keys rendered on each card through the field
   registry; supersedes the legacy `metaFields`) · `cardFieldLabels` (false by
   default — cards show dense label-less values, the Airtable look; true prefixes
   each value with its field label) · `groupField` (a select/user
   field — cards split into collapsible sections; also runtime via the toolbar,
   shared with the board) · `sortField` + `sortDir` · `cardSize` ("s"|"m"|"l") ·
   `cardClick` ("peek" default | "open"). The component is lazy. */

const GalleryView = React.lazy(() => import("./GalleryView"));
const COVER_TYPES = ["url", "links", "array"];

/* group-by + sort pickers — RIGHT of the switcher (side "trail"), matching the
   board's controls */
function GalleryToolbar({ object, viewConfig, viewState, onViewState, side }: ViewToolbarProps) {
  if (side !== "trail") return null;
  return (
    <>
      <GroupByMenu object={object} viewConfig={viewConfig} viewState={viewState} onViewState={onViewState} allowNone />
      <SortMenu object={object} viewConfig={viewConfig} viewState={viewState} onViewState={onViewState} />
    </>
  );
}

const definition: ViewDefinition = {
  type: "gallery",
  label: "Gallery",
  icon: <LayoutGrid size={13} />,
  component: GalleryView,
  Toolbar: GalleryToolbar,
  configSchema: [
    { key: "coverField", label: "Cover", kind: "field", fieldTypes: COVER_TYPES },
    { key: "coverFit", label: "Cover fit", kind: "select", options: ["cover", "contain"] },
    { key: "titleField", label: "Title", kind: "field" },
    { key: "cardFields", label: "Card fields", kind: "text" },
    { key: "cardFieldLabels", label: "Field labels on cards", kind: "boolean" },
    { key: "groupField", label: "Group by", kind: "field", fieldTypes: ["select", "user"] },
    { key: "sortField", label: "Sort by", kind: "field" },
    { key: "sortDir", label: "Sort direction", kind: "select", options: ["asc", "desc"] },
    { key: "cardSize", label: "Card size", kind: "select", options: ["s", "m", "l"] },
    { key: "cardClick", label: "Card click", kind: "select", options: ["peek", "open"] },
  ],
  defaultConfig: (object) => ({
    coverField: activeFields(object.fields).find((f) => COVER_TYPES.includes(f.type))?.key,
    cardFields: activeFields(object.fields).filter((f) => !f.primary).slice(0, 2).map((f) => f.key),
  }),
  validateConfig: (object, cfg) => {
    const fields = activeFields(object.fields);
    const has = (k: unknown) => typeof k === "string" && k !== "" && fields.some((f) => f.key === k);
    const cover = cfg.coverField;
    if (typeof cover === "string" && cover !== "") {
      const f = fields.find((x) => x.key === cover);
      if (!f) return `coverField “${cover}” is not a field of ${object.key}`;
      if (!COVER_TYPES.includes(f.type)) return `coverField “${cover}” must be a url, links, or array field`;
    }
    if (cfg.coverFit !== undefined && cfg.coverFit !== "cover" && cfg.coverFit !== "contain")
      return `coverFit must be "cover" or "contain"`;
    if (cfg.titleField !== undefined && !has(cfg.titleField)) return `titleField “${String(cfg.titleField)}” is not a field of ${object.key}`;
    const card = cfg.cardFields ?? cfg.metaFields;
    if (card !== undefined) {
      if (!Array.isArray(card)) return "cardFields must be a list of field keys";
      const bad = (card as unknown[]).find((k) => !has(k));
      if (bad !== undefined) return `cardFields “${String(bad)}” is not a field of ${object.key}`;
    }
    const g = cfg.groupField;
    if (typeof g === "string" && g !== "" && !groupableFields(object).some((f) => f.key === g))
      return `groupField “${g}” is not a select or user field of ${object.key}`;
    const s = cfg.sortField;
    if (typeof s === "string" && s !== "" && !sortableFields(object).some((f) => f.key === s))
      return `sortField “${s}” is not a sortable field of ${object.key}`;
    if (cfg.sortDir !== undefined && cfg.sortDir !== "asc" && cfg.sortDir !== "desc")
      return `sortDir must be "asc" or "desc"`;
    if (cfg.cardClick !== undefined && cfg.cardClick !== "peek" && cfg.cardClick !== "open")
      return `cardClick must be "peek" or "open"`;
    if (cfg.cardFieldLabels !== undefined && typeof cfg.cardFieldLabels !== "boolean")
      return `cardFieldLabels must be true or false`;
    return null;
  },
};

export default definition;
