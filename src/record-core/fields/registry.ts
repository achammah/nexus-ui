import type { FieldTypeDefinition } from "./types";
import {
  buildFieldRegistry,
  registryBlocksKbEdit,
  registryClearValue,
  registryFilterable,
  registryIsBlock,
  registryPreviewText,
} from "./resolve";

/* Self-registering field-type registry: every fields/<type>/definition.{ts,tsx}
   whose default export is a FieldTypeDefinition is discovered at build time —
   drop a folder, get a field type; no switch edits, no cross-feature merge
   conflicts. Definitions are metadata-light; a heavy render ships as React.lazy.
   The pure fold + capability helpers live in ./resolve.ts (node-testable). */

const modules = import.meta.glob<{ default: FieldTypeDefinition }>("./*/definition.{ts,tsx}", { eager: true });

export const fieldTypeDefinitions: Record<string, FieldTypeDefinition> = buildFieldRegistry(modules);

export const getFieldTypeDefinition = (type: string): FieldTypeDefinition | undefined =>
  fieldTypeDefinitions[type];

/* one-line host reads (see resolve.ts for semantics) */
export const fieldPreviewText = (type: string, value: unknown): string | undefined =>
  registryPreviewText(fieldTypeDefinitions, type, value);
export const fieldBlocksKbEdit = (type: string): boolean =>
  registryBlocksKbEdit(fieldTypeDefinitions, type);
export const fieldFilterable = (type: string): boolean =>
  registryFilterable(fieldTypeDefinitions, type);
export const fieldClearValue = (type: string): unknown =>
  registryClearValue(fieldTypeDefinitions, type);
export const fieldIsBlock = (type: string): boolean =>
  registryIsBlock(fieldTypeDefinitions, type);
