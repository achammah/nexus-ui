import type { FieldTypeDefinition } from "../types";
import { DraftAddress } from "../editors";

/* Built-in `address` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "address",
  Draft: DraftAddress,
};

export default definition;
