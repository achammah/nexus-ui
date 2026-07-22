import * as React from "react";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { Button } from "../../primitives/Button";

/* Chrome primitives for the deck surface.

   Everything here is a thin adapter onto the app's OWN grammar — the same
   `Button` wrapper and Radix `DropdownMenu` the record-core view bar uses — so
   the deck reads like the rest of the product instead of a widget with its own
   visual language. No bare <select>, no hand-rolled popovers, no ad-hoc button
   styling: if a control exists in the app, it is used as-is. */

/* Every menu here is non-modal: a modal Radix menu takes pointer-events off the
   whole document while open, which is wrong inside an editor (it freezes the
   canvas behind it) and leaves the surface unclickable if a close is missed. */

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

/* The app's dropdown, shaped as a value picker (the role a <select> was playing). */
export function PickerMenu<T extends string>({
  value,
  options,
  onPick,
  label,
  icon,
  variant = "ghost",
  showValue = true,
  testid,
  align = "start",
}: {
  value: T;
  options: Array<MenuOption<T>>;
  onPick: (v: T) => void;
  label: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  showValue?: boolean;
  testid?: string;
  align?: "start" | "end";
}) {
  const active = options.find((o) => o.value === value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={variant} icon={icon} data-testid={testid} aria-label={label}>
          {showValue ? active?.label ?? label : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={value === o.value}
            data-testid={testid ? `${testid}-${o.value}` : undefined}
            onCheckedChange={() => onPick(o.value)}
          >
            {o.icon ? <span className="nxPresMenuIcon">{o.icon}</span> : null}
            {o.label}
            {o.hint ? <span className="nxPresMenuHint">{o.hint}</span> : null}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* An icon action with the app's tooltip. Toolbars are icon-first here, as they
   are everywhere else in the app — a literal "• list" text label was the tell. */
export function IconAction({
  icon,
  label,
  onClick,
  active,
  disabled,
  testid,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testid?: string;
  shortcut?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant={active ? "secondary" : "ghost"}
          icon={icon}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          data-testid={testid}
          className={active ? "nxPresOn" : undefined}
        />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="nxPresTipKey">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/* A labelled action (Import / PDF / PPTX / Present). Same primitive, one idiom. */
export function TextAction({
  children,
  icon,
  onClick,
  variant = "ghost",
  disabled,
  busy,
  testid,
  title,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  testid?: string;
  title?: string;
}) {
  const btn = (
    <Button size="sm" variant={variant} icon={icon} onClick={onClick} disabled={disabled} busy={busy} data-testid={testid}>
      {children}
    </Button>
  );
  if (!title) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

/* The segmented section switcher (Slides / Share / Analytics / Rooms), styled on
   the app's scale + tokens rather than as a bespoke pill row. */
export function SectionTabs<T extends string>({
  value,
  onPick,
  tabs,
}: {
  value: T;
  onPick: (v: T) => void;
  tabs: Array<{ value: T; label: string; icon?: React.ReactNode }>;
}) {
  return (
    <nav className="nxPresTabs" role="tablist" aria-label="Presentation sections">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`nxPresTab${value === t.value ? " isActive" : ""}`}
          onClick={() => onPick(t.value)}
          data-testid={`tab-${t.value}`}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuLabel, Check };
