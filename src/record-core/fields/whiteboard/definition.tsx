import * as React from "react";
import type { FieldTypeDefinition } from "../types";
import { Thumbnail } from "./Thumbnail";
import { isScene, previewLabel } from "./scene";

/* Whiteboard field type — a per-record excalidraw canvas. The definition stays
   metadata-light (this file is eager in every consumer): the editor ships as a
   React.lazy chunk that also carries excalidraw itself; the thumbnail shell is
   tiny and pulls exportToSvg through a dynamic import only for non-empty scenes. */

const WhiteboardField = React.lazy(() => import("./WhiteboardField"));

const definition: FieldTypeDefinition = {
  type: "whiteboard",
  render: WhiteboardField,
  cell: Thumbnail,
  previewText: previewLabel,
  layout: "block",
  filterable: false,       // no meaningful operator set over scene JSON
  keyboardEditable: false, // the grid never type-to-edits a canvas
  clearValue: null,
  validate: (v, field) =>
    v === null || v === undefined || v === "" || isScene(v)
      ? null
      : `${field.label} must be a canvas scene shaped like { "elements": [...] }`,
};

export default definition;
