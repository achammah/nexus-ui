import type { FieldTypeDefinition } from "../types";
import { DraftBoolean } from "../editors";

/* Built-in `boolean` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "boolean",
  Draft: DraftBoolean,
};

export default definition;
