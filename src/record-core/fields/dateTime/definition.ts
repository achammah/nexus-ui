import type { FieldTypeDefinition } from "../types";
import { DraftDateTime } from "../editors";

/* Built-in `dateTime` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "dateTime",
  Draft: DraftDateTime,
};

export default definition;
