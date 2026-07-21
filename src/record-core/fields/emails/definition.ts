import type { FieldTypeDefinition } from "../types";
import { DraftList } from "../editors";

/* Built-in `emails` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "emails",
  Draft: DraftList,
};

export default definition;
