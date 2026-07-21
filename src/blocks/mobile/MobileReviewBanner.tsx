import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./mobile.css";

/* MobileReviewBanner — a generic bottom step-through for phones: walk a set of N items
   one at a time with ‹ prev · index/total · next › and act on the current one. Pure
   presentation, fixed to the bottom above a bottom tab bar (offset by --nx-mobilenav-h);
   the host owns the data, the stepping, and the actions. Hidden ≥769px by default, so it
   coexists with a desktop pager. Tokenized, both themes, reduced-motion aware. */

export interface ReviewAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  testid?: string;
  tone?: "default" | "accept" | "reject";
}

export interface MobileReviewBannerProps {
  index: number;          // 0-based position of the current item in the set
  total: number;          // number of items in the set
  title?: string;         // what's being stepped (e.g. the object label)
  subtitle?: string;      // optional secondary line (clamped to 2 lines)
  onPrev: () => void;
  onNext: () => void;
  onHead?: () => void;    // tapping the position header (e.g. re-focus the current item)
  actions?: ReviewAction[];
}

export function MobileReviewBanner({
  index, total, title, subtitle, onPrev, onNext, onHead, actions = [],
}: MobileReviewBannerProps) {
  if (total <= 0) return null;
  const pos = Math.min(Math.max(index, 0), total - 1) + 1;
  return (
    <div className="nxReviewBanner" data-testid="review-banner">
      <div className="nxReviewBanner-top">
        <button className="nxReviewBanner-step" data-testid="review-prev" aria-label="Previous" onClick={onPrev}>
          <ChevronLeft size={20} />
        </button>
        <button
          className="nxReviewBanner-head"
          data-testid="review-head"
          onClick={onHead}
          disabled={!onHead}
          type="button"
        >
          <span className="nxReviewBanner-count" data-testid="review-pos">{pos} / {total}</span>
          {title && <span className="nxReviewBanner-title">{title}</span>}
        </button>
        <button className="nxReviewBanner-step" data-testid="review-next" aria-label="Next" onClick={onNext}>
          <ChevronRight size={20} />
        </button>
      </div>
      {subtitle && <div className="nxReviewBanner-sub" data-testid="review-sub">{subtitle}</div>}
      {actions.length > 0 && (
        <div className="nxReviewBanner-acts">
          {actions.map((a, i) => (
            <button
              key={a.testid ?? i}
              className={`nxReviewBanner-act${a.tone && a.tone !== "default" ? ` is-${a.tone}` : ""}`}
              data-testid={a.testid}
              onClick={a.onClick}
              type="button"
            >
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
