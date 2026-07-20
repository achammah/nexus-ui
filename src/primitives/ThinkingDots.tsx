import * as React from "react";
import "./primitives.css";

/* ThinkingDots — the "AI is working" indicator (three bouncing dots). Tokenized
   (accent-colored, reduced-motion aware) so any surface can drop it in while an
   agent/task runs. Presentation only; the host owns the busy state. */

export function ThinkingDots({ className, label = "Working", ...rest }: React.HTMLAttributes<HTMLSpanElement> & { label?: string }) {
  return (
    <span className={["nxThinking", className].filter(Boolean).join(" ")} role="status" aria-label={label} {...rest}>
      <span /><span /><span />
    </span>
  );
}
