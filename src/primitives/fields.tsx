import * as React from "react";
import * as CheckboxP from "@radix-ui/react-checkbox";
import * as TabsP from "@radix-ui/react-tabs";
import * as TooltipP from "@radix-ui/react-tooltip";
import { Check } from "lucide-react";
import "./primitives.css";

/* Input ------------------------------------------------------------------ */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, className = "", ...rest }, ref) => (
    <input ref={ref} className={`nxInput ${invalid ? "nxInput--invalid" : ""} ${className}`} {...rest} />
  ),
);
Input.displayName = "Input";

/* Badge ------------------------------------------------------------------ */
export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
  dot?: boolean;
  children: React.ReactNode;
}) {
  const cls = tone === "neutral" ? "" : ` nxBadge--${tone}`;
  return (
    <span className={`nxBadge${cls}`}>
      {dot && <span className="nxDot" aria-hidden />}
      {children}
    </span>
  );
}

/* Micro eyebrow label ------------------------------------------------------ */
export function Micro({ children }: { children: React.ReactNode }) {
  return <span className="nxMicro">{children}</span>;
}

/* Tabs --------------------------------------------------------------------- */
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
    <TabsP.Root value={value} onValueChange={onValueChange}>
      <TabsP.List className="nxTabs">
        {tabs.map((t) => (
          <TabsP.Trigger key={t.value} value={t.value} className="nxTab">
            {t.label}
          </TabsP.Trigger>
        ))}
      </TabsP.List>
      {children}
    </TabsP.Root>
  );
}
export const TabPanel = TabsP.Content;

/* Checkbox ------------------------------------------------------------------ */
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
    <CheckboxP.Root className="nxCheck" checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} aria-label={ariaLabel}>
      <CheckboxP.Indicator>
        <Check size={11} strokeWidth={3} />
      </CheckboxP.Indicator>
    </CheckboxP.Root>
  );
}

/* Tooltip ------------------------------------------------------------------- */
export function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <TooltipP.Provider delayDuration={350}>
      <TooltipP.Root>
        <TooltipP.Trigger asChild>{children}</TooltipP.Trigger>
        <TooltipP.Portal>
          <TooltipP.Content className="nxTooltip" sideOffset={6}>
            {label}
          </TooltipP.Content>
        </TooltipP.Portal>
      </TooltipP.Root>
    </TooltipP.Provider>
  );
}
