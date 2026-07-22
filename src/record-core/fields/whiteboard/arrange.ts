/* Arrange operations — z-order (stacking) + group/ungroup — as pure array transforms
   over excalidraw elements. Excalidraw paints elements in the order of the scene
   array and derives each element's fractional `index` from that order on updateScene;
   so a z-order change is an array reorder with indices cleared (excalidraw re-derives
   valid ascending indices from the new order). Grouping pushes a shared id onto each
   selected element's `groupIds`; ungrouping pops the innermost shared group.

   Pure + node-testable — takes elements + selected ids, returns a NEW element array.
   Generic over the element shape so both the scene and imperative-API element types
   pass through. The caller applies it via api.updateScene({ elements }). */

import type { SceneElementLike } from "./scene";

type El = SceneElementLike;

/* strip fractional indices so excalidraw re-derives them from the new array order */
const cleared = <T extends El>(els: T[]): T[] =>
  els.map((e) => {
    if (e.index === undefined) return e;
    const { index: _drop, ...rest } = e as T & { index?: unknown };
    return rest as unknown as T;
  });

const isSel = (e: El, ids: Set<string>) => ids.has(e.id);

export function bringToFront<T extends El>(elements: T[], ids: string[]): T[] {
  const s = new Set(ids);
  const rest = elements.filter((e) => !isSel(e, s));
  const sel = elements.filter((e) => isSel(e, s));
  return cleared([...rest, ...sel]);
}

export function sendToBack<T extends El>(elements: T[], ids: string[]): T[] {
  const s = new Set(ids);
  const rest = elements.filter((e) => !isSel(e, s));
  const sel = elements.filter((e) => isSel(e, s));
  return cleared([...sel, ...rest]);
}

/* move every selected element one slot toward the front (end of array), preserving
   their relative order and never crossing past each other */
export function bringForward<T extends El>(elements: T[], ids: string[]): T[] {
  const s = new Set(ids);
  const arr = [...elements];
  for (let i = arr.length - 2; i >= 0; i--) {
    if (isSel(arr[i], s) && !isSel(arr[i + 1], s)) {
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    }
  }
  return cleared(arr);
}

export function sendBackward<T extends El>(elements: T[], ids: string[]): T[] {
  const s = new Set(ids);
  const arr = [...elements];
  for (let i = 1; i < arr.length; i++) {
    if (isSel(arr[i], s) && !isSel(arr[i - 1], s)) {
      [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
    }
  }
  return cleared(arr);
}

let groupSeq = 0;
const newGroupId = () => `nxg_${Date.now().toString(36)}_${(groupSeq++).toString(36)}`;

/* wrap the selected elements in a fresh shared group (nesting-aware: pushes onto the
   existing groupIds, so a group can live inside another) */
export function groupSelected<T extends El>(elements: T[], ids: string[]): T[] {
  const s = new Set(ids);
  if (s.size < 2) return elements;
  const gid = newGroupId();
  return elements.map((e) => {
    if (!isSel(e, s)) return e;
    const g = Array.isArray(e.groupIds) ? (e.groupIds as string[]) : [];
    return { ...e, groupIds: [...g, gid] };
  });
}

/* remove the innermost shared group from the selected elements */
export function ungroupSelected<T extends El>(elements: T[], ids: string[]): T[] {
  const s = new Set(ids);
  return elements.map((e) => {
    if (!isSel(e, s)) return e;
    const g = Array.isArray(e.groupIds) ? (e.groupIds as string[]) : [];
    if (g.length === 0) return e;
    return { ...e, groupIds: g.slice(0, -1) };
  });
}

/* does the selection share at least one group (so Ungroup is meaningful)? */
export function hasSharedGroup(elements: El[], ids: string[]): boolean {
  const s = new Set(ids);
  const sel = elements.filter((e) => isSel(e, s));
  return sel.some((e) => Array.isArray(e.groupIds) && (e.groupIds as string[]).length > 0);
}
