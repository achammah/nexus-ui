import type { ViewDefinition } from "./types";
import { buildRegistry } from "./resolve";

/* Self-registering view registry: every views/<type>/definition.{ts,tsx} whose
   default export is a ViewDefinition is discovered at build time — drop a
   folder, get a view type; no switcher edits, no cross-feature merge conflicts.
   Definitions are metadata-light; a heavy view component ships as React.lazy.
   The pure fold + derivation live in ./resolve.ts (node-testable). */

const modules = import.meta.glob<{ default: ViewDefinition }>("./*/definition.{ts,tsx}", { eager: true });

export const viewDefinitions: Record<string, ViewDefinition> = buildRegistry(modules);

export const getViewDefinition = (type: string): ViewDefinition | undefined => viewDefinitions[type];
