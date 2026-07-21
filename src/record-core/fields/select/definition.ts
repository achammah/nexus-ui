import type { FieldTypeDefinition } from "../types";
import { DraftSelect } from "../editors";

/* Built-in `select` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "select",
  Draft: DraftSelect,
};

export default definition;
