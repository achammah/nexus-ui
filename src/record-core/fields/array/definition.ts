import type { FieldTypeDefinition } from "../types";
import { DraftArray } from "../editors";

/* Built-in `array` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "array",
  Draft: DraftArray,
};

export default definition;
