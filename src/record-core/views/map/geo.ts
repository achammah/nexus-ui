import type { FieldDef, ObjectConfig, RecordRow } from "../../types";

/* Pure geo core for the map view — no browser, no maplibre: unit-testable under
   node:test (the starter's journeys/unit/map-geo.test.ts exercises it). */

/* past this many located records the view switches from DOM markers (real React
   pins, keyboard-focusable) to GL cluster rendering (Source cluster + layers) */
export const CLUSTER_THRESHOLD = 25;

const LAT_NAME = /^(lat|latitude)$/i;
const LNG_NAME = /^(lng|lon|long|longitude)$/i;

export interface LocatedRow {
  row: RecordRow;
  lat: number;
  lng: number;
}

/* 0 is a VALID coordinate (0°N / 0°E) — validity is type + range, never truthiness */
export const isValidLat = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
export const isValidLng = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;

const numberFields = (object: ObjectConfig): FieldDef[] =>
  object.fields.filter((f) => f.type === "number" && f.isActive !== false);

/* infer the coordinate pair from number-field names — key first, then label
   (lat/latitude · lng/lon/long/longitude) */
export function inferCoordFields(object: ObjectConfig): { latField?: string; lngField?: string } {
  const nums = numberFields(object);
  const find = (re: RegExp) => nums.find((f) => re.test(f.key)) ?? nums.find((f) => re.test(f.label));
  return { latField: find(LAT_NAME)?.key, lngField: find(LNG_NAME)?.key };
}

/* split rows into plottable coords + the not-plottable count (counted in the
   corner chip — never silently dropped) */
export function splitRows(
  rows: RecordRow[],
  latKey: string,
  lngKey: string,
): { located: LocatedRow[]; withoutLocation: number } {
  const located: LocatedRow[] = [];
  let withoutLocation = 0;
  for (const row of rows) {
    const lat = row[latKey];
    const lng = row[lngKey];
    if (isValidLat(lat) && isValidLng(lng)) located.push({ row, lat, lng });
    else withoutLocation++;
  }
  return { located, withoutLocation };
}

/* a finite number from a raw field value — plain numbers, and the `amount` of a
   shaped money/currency value (so size/heatmap-weight can read a currency field) */
export function numericValue(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof (v as { amount?: unknown }).amount === "number")
    return (v as { amount: number }).amount;
  return undefined;
}

/* GeoJSON for the point/cluster/heatmap sources. Properties carry the row id, the
   color-field OPTION VALUE (the paint layer maps values → resolved literals, since
   GL can't read CSS custom properties), the numeric SIZE (marker radius by field)
   and the heatmap WEIGHT — each present only when its field is configured and the
   row holds a number. */
export function toFeatureCollection(located: LocatedRow[], colorKey?: string, sizeKey?: string, weightKey?: string) {
  return {
    type: "FeatureCollection" as const,
    features: located.map(({ row, lat, lng }) => {
      const properties: Record<string, unknown> = { id: String(row.id) };
      if (colorKey) properties.option = String(row[colorKey] ?? "");
      if (sizeKey) {
        const s = numericValue(row[sizeKey]);
        if (s !== undefined) properties.size = s;
      }
      if (weightKey) {
        const w = numericValue(row[weightKey]);
        if (w !== undefined) properties.weight = w;
      }
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
        properties,
      };
    }),
  };
}

/* marker radius scale by a number field: the [min,max] of the located values, and
   a value → pixel-radius map inside [MARKER_MIN_R, MARKER_MAX_R]. Null extent (no
   size field / no numeric values) → the neutral default radius. */
export const MARKER_MIN_R = 6;
export const MARKER_MAX_R = 22;
export const MARKER_DEFAULT_R = 9;

export function sizeExtent(located: LocatedRow[], sizeKey?: string): { min: number; max: number } | null {
  if (!sizeKey) return null;
  let min = Infinity;
  let max = -Infinity;
  let seen = false;
  for (const { row } of located) {
    const v = numericValue(row[sizeKey]);
    if (v === undefined) continue;
    seen = true;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return seen ? { min, max } : null;
}

export function radiusFor(value: number | undefined, ext: { min: number; max: number } | null): number {
  if (value === undefined || !ext) return MARKER_DEFAULT_R;
  if (ext.max === ext.min) return (MARKER_MIN_R + MARKER_MAX_R) / 2;
  const t = Math.max(0, Math.min(1, (value - ext.min) / (ext.max - ext.min)));
  return MARKER_MIN_R + t * (MARKER_MAX_R - MARKER_MIN_R);
}

/* [[minLng,minLat],[maxLng,maxLat]] over the located rows; null when empty */
export function boundsOf(located: LocatedRow[]): [[number, number], [number, number]] | null {
  if (located.length === 0) return null;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const { lat, lng } of located) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

/* the definition's defaultConfig: inferred coordinate fields + the primary as title */
export function mapDefaultConfig(object: ObjectConfig): Record<string, unknown> {
  const primary = object.fields.find((f) => f.primary) ?? object.fields[0];
  return { ...inferCoordFields(object), titleField: primary?.key };
}

/* the definition's validateConfig — names exactly what is missing or mistyped */
export function mapValidateConfig(object: ObjectConfig, cfg: Record<string, unknown>): string | null {
  const nums = numberFields(object);
  const lat = typeof cfg.latField === "string" && cfg.latField ? cfg.latField : undefined;
  const lng = typeof cfg.lngField === "string" && cfg.lngField ? cfg.lngField : undefined;
  if (!lat || !lng) {
    return nums.length >= 2
      ? `map view needs latField and lngField — number fields of ${object.key} (e.g. “${nums[0].key}”, “${nums[1].key}”)`
      : `“${object.label}” has no pair of number fields to use as coordinates`;
  }
  for (const [key, name] of [[lat, "latField"], [lng, "lngField"]] as const) {
    if (!nums.some((f) => f.key === key)) return `${name} “${key}” is not a number field of ${object.key}`;
  }
  if (lat === lng) return "latField and lngField must be two different fields";
  const color = cfg.colorField;
  if (typeof color === "string" && color && !object.fields.some((f) => f.key === color && f.type === "select"))
    return `colorField “${color}” is not a select field of ${object.key}`;
  const title = cfg.titleField;
  if (typeof title === "string" && title && !object.fields.some((f) => f.key === title))
    return `titleField “${title}” is not a field of ${object.key}`;
  return null;
}
