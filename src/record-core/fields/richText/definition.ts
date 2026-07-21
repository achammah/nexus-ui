import type { FieldTypeDefinition } from "../types";
import { DraftLongText } from "../editors";

/* Built-in `richText` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "richText",
  Draft: DraftLongText,
};

export default definition;
