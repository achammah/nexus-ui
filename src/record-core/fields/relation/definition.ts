import type { FieldTypeDefinition } from "../types";
import { DraftRelation } from "../editors";

/* Built-in `relation` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "relation",
  Draft: DraftRelation,
};

export default definition;
