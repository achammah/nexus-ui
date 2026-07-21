import type { FieldTypeDefinition } from "./types";

/* Pure registry core — no browser, no vite: unit-testable under node:test
   (the starter's journeys/unit/ exercises it). registry.ts feeds
   buildFieldRegistry the glob modules; hosts read capabilities through the
   helpers so their call sites stay one-line. */

/* fold discovered definition modules into the type → definition map */
export const buildFieldRegistry = (
  modules: Record<string, { default?: FieldTypeDefinition }>,
): Record<string, FieldTypeDefinition> => {
  const defs: Record<string, FieldTypeDefinition> = {};
  for (const m of Object.values(modules)) {
    if (m.default?.type) defs[m.default.type] = m.default;
  }
  return defs;
};

/* capability reads — tolerate an unregistered type everywhere */
export const registryPreviewText = (
  defs: Record<string, FieldTypeDefinition>,
  type: string,
  value: unknown,
): string | undefined => defs[type]?.previewText?.(value);

/* explicit false only — a registered type without the flag keeps the host rule */
export const registryBlocksKbEdit = (
  defs: Record<string, FieldTypeDefinition>,
  type: string,
): boolean => defs[type]?.keyboardEditable === false;

export const registryFilterable = (
  defs: Record<string, FieldTypeDefinition>,
  type: string,
): boolean => defs[type]?.filterable !== false;

export const registryClearValue = (
  defs: Record<string, FieldTypeDefinition>,
  type: string,
): unknown => defs[type]?.clearValue;

export const registryIsBlock = (
  defs: Record<string, FieldTypeDefinition>,
  type: string,
): boolean => defs[type]?.layout === "block";
