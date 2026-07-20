/* nexus-ui — source-distributed component library (the shadcn model: consumers vendor
   src/ and own it). Import surface: */

export { Button } from "./primitives/Button";
export { Input, Badge, Micro, Tabs, TabPanel, Checkbox, Tip } from "./primitives/fields";
export { Dialog, Menu } from "./primitives/overlays";
export { SettingsTabs } from "./primitives/SettingsTabs";
export type { SettingsTab } from "./primitives/SettingsTabs";
export { EditableRuleList } from "./primitives/EditableRuleList";
export type { SeverityOption, EditableRuleListProps } from "./primitives/EditableRuleList";

export { DataTable } from "./record-core/DataTable";
export { KanbanBoard } from "./record-core/KanbanBoard";
export { RecordPage } from "./record-core/RecordPage";
export type { ObjectConfig, FieldDef, RecordRow, ViewDef, TimelineEvent, FieldType } from "./record-core/types";
