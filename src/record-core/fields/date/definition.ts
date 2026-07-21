import type { FieldTypeDefinition } from "../types";
import { DraftDate } from "../editors";

/* Built-in `date` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "date",
  Draft: DraftDate,
};

export default definition;
