import type { FieldTypeDefinition } from "../types";
import { DraftList } from "../editors";

/* Built-in `links` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "links",
  Draft: DraftList,
};

export default definition;
