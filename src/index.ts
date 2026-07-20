/* nexus-ui — source-distributed component library (the shadcn model: consumers vendor
   src/ and own it). Import surface: */

export { Button } from "./primitives/Button";
export { Input, Badge, Micro, Tabs, TabPanel, Checkbox, Tip } from "./primitives/fields";
export { Dialog, Menu } from "./primitives/overlays";
export { ThinkingDots } from "./primitives/ThinkingDots";

/* async + live-sync hooks */
export { usePollRev } from "./hooks/usePollRev";
export { useAsyncOp, computeAsyncOp } from "./hooks/useAsyncOp";
export { useDebouncedSave, createDebouncer } from "./hooks/useDebouncedSave";
export type { SaveState } from "./hooks/useDebouncedSave";

/* skins */
export { skinPresets, warmOptPalette, warmOptSkin } from "./skins/presets";

export { DataTable } from "./record-core/DataTable";
export { KanbanBoard } from "./record-core/KanbanBoard";
export { RecordPage } from "./record-core/RecordPage";
export type { ObjectConfig, FieldDef, RecordRow, ViewDef, TimelineEvent, FieldType } from "./record-core/types";
