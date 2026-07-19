import * as React from "react";
import { Input as UIInput } from "../components/ui/input";
import { Badge as UIBadge } from "../components/ui/badge";
import { Checkbox as UICheckbox } from "../components/ui/checkbox";
import { Tabs as UITabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import "./primitives.css";

/* Wrappers over vendored shadcn components — stable API for record-core/apps;
   Nexus-specific tones ride token-bound classes, never edits to components/ui. */

export interface InputProps extends React.ComponentProps<"input"> {
  invalid?: boolean;
}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, ...rest }, ref) => <UIInput ref={ref} aria-invalid={invalid || undefined} {...rest} />,
);
Input.displayName = "Input";

const TONE = {
  neutral: "",
  ok: "border-transparent bg-[var(--nx-ok-soft)] text-[var(--nx-ok)]",
  warn: "border-transparent bg-[var(--nx-warn-soft)] text-[var(--nx-warn)]",
  danger: "border-transparent bg-[var(--nx-danger-soft)] text-[var(--nx-danger)]",
  accent: "border-transparent bg-[var(--nx-accent-soft)] text-[var(--nx-accent)]",
} as const;

export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: keyof typeof TONE;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <UIBadge variant={tone === "neutral" ? "secondary" : "outline"} className={cn(TONE[tone])}>
      {dot && <span className="nxDot" aria-hidden />}
      {children}
    </UIBadge>
  );
}

export function Micro({ children }: { children: React.ReactNode }) {
  return <span className="nxMicro">{children}</span>;
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  children,
}: {
  tabs: { value: string; label: React.ReactNode }[];
  value: string;
  onValueChange: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <UITabs value={value} onValueChange={onValueChange}>
      <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto">
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className={cn(
              "nxTab rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2",
              "data-[state=active]:border-[var(--nx-accent)] data-[state=active]:bg-transparent data-[state=active]:shadow-none",
            )}
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </UITabs>
  );
}
export const TabPanel = TabsContent;

export function Checkbox({
  checked,
  onCheckedChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <UICheckbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} aria-label={ariaLabel} />
  );
}

export function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <TooltipProvider delayDuration={350}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent sideOffset={6}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
