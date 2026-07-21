import type { FieldTypeDefinition } from "../types";
import { DraftLongText } from "../editors";

/* Built-in `longText` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "longText",
  Draft: DraftLongText,
};

export default definition;
