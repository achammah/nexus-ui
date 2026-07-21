import type { FieldDef, ObjectConfig } from "../types";
import type { ViewDefinition, ViewInstanceConfig } from "./types";

/* Pure registry core — no browser, no vite: unit-testable under node:test
   (the starter's journeys/unit/ exercises it). registry.ts feeds buildRegistry
   the glob modules; the list host feeds configuredViewsFor its object +
   groupable fields. */

/* fold discovered definition modules into the type → definition map */
export const buildRegistry = (
  modules: Record<string, { default?: ViewDefinition }>,
): Record<string, ViewDefinition> => {
  const defs: Record<string, ViewDefinition> = {};
  for (const m of Object.values(modules)) {
    if (m.default?.type) defs[m.default.type] = m.default;
  }
  return defs;
};

/* an object's view tabs: config `views` when declared, else the derived
   pre-registry set — the table, plus board + chart when a groupable
   (select/user) field exists */
export const configuredViewsFor = (
  object: ObjectConfig,
  groupables: FieldDef[],
): ViewInstanceConfig[] =>
  object.views?.length
    ? object.views
    : (groupables.length > 0 ? ["table", "kanban", "chart"] : ["table"]).map((type) => ({ type }));
