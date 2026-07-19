import * as React from "react";
import * as DialogP from "@radix-ui/react-dialog";
import * as MenuP from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import { Button } from "./Button";
import "./primitives.css";

/* Dialog -------------------------------------------------------------------- */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogP.Root open={open} onOpenChange={onOpenChange}>
      <DialogP.Portal>
        <DialogP.Overlay className="nxOverlay" />
        <DialogP.Content className="nxDialog">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <DialogP.Title style={{ font: "var(--nx-text-title)", margin: 0 }}>{title}</DialogP.Title>
            <DialogP.Close asChild>
              <Button variant="ghost" size="sm" icon={<X size={14} />} aria-label="Close" />
            </DialogP.Close>
          </div>
          {children}
          {footer && <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>{footer}</div>}
        </DialogP.Content>
      </DialogP.Portal>
    </DialogP.Root>
  );
}

/* Dropdown menu --------------------------------------------------------------- */
export function Menu({
  trigger,
  items,
}: {
  trigger: React.ReactElement;
  items: { key: string; label: React.ReactNode; danger?: boolean; onSelect: () => void }[];
}) {
  return (
    <MenuP.Root>
      <MenuP.Trigger asChild>{trigger}</MenuP.Trigger>
      <MenuP.Portal>
        <MenuP.Content className="nxMenu" sideOffset={5} align="end">
          {items.map((it) => (
            <MenuP.Item
              key={it.key}
              className={`nxMenuItem ${it.danger ? "nxMenuItem--danger" : ""}`}
              onSelect={it.onSelect}
            >
              {it.label}
            </MenuP.Item>
          ))}
        </MenuP.Content>
      </MenuP.Portal>
    </MenuP.Root>
  );
}
