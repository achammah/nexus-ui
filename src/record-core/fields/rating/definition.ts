import type { FieldTypeDefinition } from "../types";
import { DraftRating } from "../editors";

/* Built-in `rating` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "rating",
  Draft: DraftRating,
};

export default definition;
