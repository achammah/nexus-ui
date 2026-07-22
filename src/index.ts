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
export { NotionEditor, textToBlocks, blocksToMarkdown, markdownToBlocks, htmlToBlocks, highlightCode, bid } from "./record-core/NotionEditor";
export type { Block, BlockType, InlineChange, EditorConfig, CalloutTone, PageContext } from "./record-core/NotionEditor";
export { DocumentOutline, outlineFromBlocks } from "./record-core/DocumentOutline";
export type { OutlineHeading } from "./record-core/DocumentOutline";
export { blocksToHtml, inlineToHtml, exportMarkdown, exportHtml, exportPdf, exportDocx, docxBlob, importFile, downloadBlob, downloadText, IMPORT_ACCEPT } from "./record-core/editor-io";
export type { ImportResult } from "./record-core/editor-io";
export { useSuggestions } from "./record-core/useSuggestions";
export type { Suggestion, UseSuggestions } from "./record-core/useSuggestions";
export { SuggestionPanel } from "./record-core/SuggestionPanel";
export type { SuggestionPanelProps } from "./record-core/SuggestionPanel";
export { Pipeline, Chip } from "./record-core/Pipeline";
export type { ChipTone } from "./record-core/Pipeline";
export { FilterBar, FilterChips, matchFilters, opsFor, filterableFields } from "./record-core/Filters";
export type { FilterField, FilterCond } from "./record-core/Filters";
export type { ObjectConfig, FieldDef, RecordRow, ViewDef, TimelineEvent, FieldType } from "./record-core/types";

/* task model — pure helpers for task-shaped objects (subtasks + dependencies as
   self-relations; the timeline view consumes these) + config factory + demo seed */
export {
  taskObjectConfig, TASK_KEYS, DEFAULT_TASK_STATUSES, DEFAULT_TASK_PRIORITIES,
  buildTaskTree, flattenTree, subtaskRollup, taskParentId, taskDependencyIds,
  taskHealth, doneStatusValues, rollRecurrencePatch,
  seedTasks, SEED_TASK_USERS, SEED_TASK_LABELS,
} from "./record-core/tasks";
export type { TaskFieldKeys, TaskConfigOptions, TaskNode, TaskHealth, RepeatRule } from "./record-core/tasks";

/* time tracking — the entry-log timer (one running at a time), spent-vs-estimate
   budgets and the today/focus day plan (consumed by the "focus" view) */
export {
  TIME_KEYS, taskEntries, runningEntry, isTracking, trackingRow, entrySeconds,
  trackedSeconds, trackedSecondsOn, totalTrackedOn, startTimerPatches,
  stopTimerPatch, toggleTimerPatches, logTimePatch, secondsToHours,
  formatDuration, formatClock, timeBudget, isPlannedFor, planForDayPatch,
  unplanPatch, plannedRows, focusSuggestions, dayLoad, sessionSeconds,
} from "./record-core/timeTracking";
export type { TimeEntry, TimeFieldKeys, TimeBudget, DayLoad } from "./record-core/timeTracking";

/* issue-provider sync SEAM — payload shapes + mappings + a pure diff. Performs
   no network I/O: the consumer supplies the authenticated fetch. */
export {
  syncIssues, linkIssues, GITHUB_MAPPING, JIRA_MAPPING, mockIssues, MOCK_NOTICE, MOCK_ISSUE_LABELS,
} from "./record-core/taskSync";
export type {
  ProviderIssue, IssueMapping, GitHubIssuePayload, JiraIssuePayload, SyncOptions, SyncPatchset,
} from "./record-core/taskSync";

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

/* blocks — 3D object / floor-plan viewer (three.js) as a standalone surface (lazy engine) */
export * from "./blocks/viewer3d";
/* blocks — Notion×Google-Docs document as a standalone surface (light editor + outline;
   docx/mammoth lazy-loaded only on export/import) */
export * from "./blocks/document";
