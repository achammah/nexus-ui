import type * as React from "react";
import type { FieldDef } from "../types";
import type { FieldDraftProps } from "./types";
import { fieldTypeDefinitions } from "./registry";
import { DraftText } from "./editors";

/* Host-side draft-editor lookup: the registered entry's Draft slot, with the
   text editor as the unknown-type fallback (a future custom type without a
   Draft still renders SOMETHING typable rather than nothing). Lives apart from
   editors.tsx so definitions (registry ← glob) can import editors without a
   cycle. */
export const fieldDraftEditor = (f: FieldDef): React.ComponentType<FieldDraftProps> =>
  fieldTypeDefinitions[f.type]?.Draft ?? DraftText;
