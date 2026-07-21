/* nexus-ui — source-distributed component library (the shadcn model: consumers vendor
   src/ and own it). Import surface: */

export { Button } from "./primitives/Button";
export { Input, Badge, Micro, Tabs, TabPanel, Checkbox, Tip } from "./primitives/fields";
export { Dialog, Menu } from "./primitives/overlays";
export { SettingsTabs } from "./primitives/SettingsTabs";
export type { SettingsTab } from "./primitives/SettingsTabs";
export { EditableRuleList } from "./primitives/EditableRuleList";
export type { SeverityOption, EditableRuleListProps } from "./primitives/EditableRuleList";
export { ThinkingDots } from "./primitives/ThinkingDots";
export { Markdown, renderMarkdown } from "./primitives/Markdown";

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
export { NotionEditor, textToBlocks, blocksToMarkdown, bid } from "./record-core/NotionEditor";
export type { Block, InlineChange } from "./record-core/NotionEditor";
export { useSuggestions } from "./record-core/useSuggestions";
export type { Suggestion, UseSuggestions } from "./record-core/useSuggestions";
export { SuggestionPanel } from "./record-core/SuggestionPanel";
export type { SuggestionPanelProps } from "./record-core/SuggestionPanel";
export { Pipeline, Chip } from "./record-core/Pipeline";
export type { ChipTone } from "./record-core/Pipeline";
export { FilterBar, FilterChips, matchFilters, opsFor, filterableFields } from "./record-core/Filters";
export type { FilterField, FilterCond } from "./record-core/Filters";
export type { ObjectConfig, FieldDef, RecordRow, ViewDef, TimelineEvent, FieldType } from "./record-core/types";

/* view registry — self-registering view types (views/<type>/definition.tsx) */
export { viewDefinitions, getViewDefinition } from "./record-core/views/registry";
export type { ViewDefinition, ViewProps, ViewToolbarProps, ViewConfigField, ViewInstanceConfig } from "./record-core/views/types";
export { groupableFields, measurableFields, resolveGroupBy } from "./record-core/views/group";

/* blocks — composed multi-step UI (guided wizard) */
export * from "./blocks/wizard";

/* blocks — AI copilot side-panel */
export * from "./blocks/copilot";

/* blocks — mobile chrome: keyboard-shortcuts overlay + phone review banner */
export * from "./blocks/mobile";

/* blocks — full spreadsheet workbook (Univer) as a standalone surface (lazy engine) */
export * from "./blocks/workbook";
