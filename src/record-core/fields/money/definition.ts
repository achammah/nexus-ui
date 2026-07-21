import type { FieldTypeDefinition } from "../types";
import { DraftMoney } from "../editors";

/* Built-in `money` — registers its draft editor on the field-type registry (the
   render/cell surfaces stay in the host switches; see fields/types.ts). */
const definition: FieldTypeDefinition = {
  type: "money",
  Draft: DraftMoney,
};

export default definition;
