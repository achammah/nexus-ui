import type { FieldTypeDefinition } from "../types";
import { DraftMultiSelect } from "../editors";

/* Built-in `multiselect` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "multiselect",
  Draft: DraftMultiSelect,
};

export default definition;
