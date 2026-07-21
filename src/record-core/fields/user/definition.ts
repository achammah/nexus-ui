import type { FieldTypeDefinition } from "../types";
import { DraftUser } from "../editors";

/* Built-in `user` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "user",
  Draft: DraftUser,
};

export default definition;
