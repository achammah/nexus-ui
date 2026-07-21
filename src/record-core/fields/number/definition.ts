import type { FieldTypeDefinition } from "../types";
import { DraftNumber } from "../editors";

/* Built-in `number` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "number",
  Draft: DraftNumber,
};

export default definition;
