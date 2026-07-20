import * as React from "react";
import { X } from "lucide-react";

/* ModalOverlay — a standalone full-screen overlay shell: Escape + backdrop-click close,
   optional × button. Wraps ANY children — zero coupling to Wizard or any particular
   content. */

export function ModalOverlay({
  onClose,
  children,
  testId = "modal-overlay",
  label,
  showClose = true,
}: {
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
  label?: string;
  showClose?: boolean;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="nxwiz-overlay"
      data-testid={testId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nxwiz-modal" role="dialog" aria-modal="true" aria-label={label}>
        {showClose && (
          <button className="nxwiz-modal-x" data-testid={`${testId}-close`} aria-label="Close" onClick={onClose}>
            <X size={17} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
