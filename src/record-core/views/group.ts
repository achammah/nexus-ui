import type { FieldDef, ObjectConfig } from "../types";
import { isMeasurable } from "../types";
import { activeFields } from "../options";

/* Shared field derivations for grouping views (board + chart) and their host:
   ONE source for "what can group" / "what can measure" so the switcher's
   availability rule and each view's fallbacks can never drift. */

/* fields a board/chart can group by */
export const groupableFields = (object: ObjectConfig): FieldDef[] =>
  activeFields(object.fields).filter((f) => f.type === "select" || f.type === "user");

/* fields a chart measure / kanban rollup can aggregate */
export const measurableFields = (object: ObjectConfig): FieldDef[] =>
  activeFields(object.fields).filter((f) => isMeasurable(f));

/* Resolve the ACTIVE group field: the user's runtime pick (viewState.groupBy),
   else the instance config (viewConfig.groupField), else the object's
   stageField, else the first groupable — skipping any candidate that no longer
   names a live groupable field (a stale persisted pick falls through). */
export const resolveGroupBy = (
  object: ObjectConfig,
  viewConfig: Record<string, unknown>,
  viewState: Record<string, unknown>,
): string => {
  const groupables = groupableFields(object);
  const candidates = [viewState.groupBy, viewConfig.groupField, object.stageField, groupables[0]?.key];
  for (const c of candidates) {
    if (typeof c === "string" && groupables.some((f) => f.key === c)) return c;
  }
  return "";
};
