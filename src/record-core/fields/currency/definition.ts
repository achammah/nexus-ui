import type { FieldTypeDefinition } from "../types";
import { DraftNumber } from "../editors";

/* Built-in `currency` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "currency",
  Draft: DraftNumber,
};

export default definition;
