import type { FieldTypeDefinition } from "../types";
import { DraftText } from "../editors";

/* Built-in `text` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "text",
  Draft: DraftText,
};

export default definition;
