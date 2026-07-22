import * as React from "react";
import type { Slide, SlideBlocks, SlideLayout } from "./types";
import { ElementLayer } from "./ElementLayer";

/* Very small allowlist sanitizer for stored rich-text HTML: strips script/style
   tags, event handlers and javascript: URLs. Content is author-owned (same org),
   but shared-link viewers render it too, so we scrub before injecting. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, "");
}

export interface SlideRegions {
  /* region key -> placeholder text; order = render order */
  regions: Array<{ key: keyof SlideBlocks; placeholder: string; className: string; tag?: "div" }>;
  hasImage?: boolean;
}

export const LAYOUTS: Record<SlideLayout, { label: string; spec: SlideRegions }> = {
  title: {
    label: "Title",
    spec: {
      regions: [
        { key: "title", placeholder: "Presentation title", className: "nxPresTitle" },
        { key: "subtitle", placeholder: "Subtitle", className: "nxPresSubtitle" },
      ],
    },
  },
  "title-body": {
    label: "Title + body",
    spec: {
      regions: [
        { key: "title", placeholder: "Slide title", className: "nxPresH" },
        { key: "body", placeholder: "Body text — use the toolbar for bold, italics and lists", className: "nxPresBody" },
      ],
    },
  },
  "two-column": {
    label: "Two columns",
    spec: {
      regions: [
        { key: "title", placeholder: "Slide title", className: "nxPresH" },
        { key: "left", placeholder: "Left column", className: "nxPresCol nxPresColLeft" },
        { key: "right", placeholder: "Right column", className: "nxPresCol nxPresColRight" },
      ],
    },
  },
  image: {
    label: "Image",
    spec: {
      regions: [
        { key: "title", placeholder: "Slide title", className: "nxPresH" },
        { key: "caption", placeholder: "Caption", className: "nxPresCaption" },
      ],
      hasImage: true,
    },
  },
  quote: {
    label: "Quote",
    spec: {
      regions: [
        { key: "quote", placeholder: "“The quote”", className: "nxPresQuote" },
        { key: "attribution", placeholder: "Who said it", className: "nxPresAttribution" },
      ],
    },
  },
  section: {
    label: "Section",
    spec: { regions: [{ key: "title", placeholder: "Section title", className: "nxPresSection" }] },
  },
  blank: {
    label: "Blank",
    spec: { regions: [{ key: "body", placeholder: "Anything goes", className: "nxPresBody nxPresBlank" }] },
  },
};

export interface SlideViewProps {
  slide: Slide;
  /* editable regions (contentEditable) — editor canvas only */
  editable?: boolean;
  onBlockChange?: (key: keyof SlideBlocks, html: string) => void;
  onImagePick?: () => void;
  /* which region currently holds focus (editor styles the active outline) */
  onRegionFocus?: (key: keyof SlideBlocks) => void;
  /* free-placement layer (ElementLayer in the editor; a static render elsewhere).
     Kept as a slot so SlideView stays presentational and the editor owns gestures. */
  elementLayer?: React.ReactNode;
}

/* Renders ONE slide at its natural 16:9 box (the host scales via transform or
   width). Used by the editor canvas (editable), the filmstrip (scaled down),
   present mode and the read-only viewer. */
export function SlideView({ slide, editable, onBlockChange, onImagePick, onRegionFocus, elementLayer }: SlideViewProps) {
  const { spec } = LAYOUTS[slide.layout] ?? LAYOUTS.blank;
  return (
    <div className={`nxPresSlide nxPresLayout-${slide.layout}`} data-slide-id={slide.id}>
      {spec.hasImage && (
        <div className="nxPresImageWell">
          {slide.blocks.imageUrl ? (
            <img className="nxPresImage" src={slide.blocks.imageUrl} alt={textOf(slide.blocks.caption) || "Slide image"} />
          ) : (
            <button
              type="button"
              className="nxPresImageEmpty"
              onClick={editable ? onImagePick : undefined}
              disabled={!editable}
            >
              {editable ? "Add an image…" : "No image"}
            </button>
          )}
          {editable && slide.blocks.imageUrl && (
            <button type="button" className="nxPresImageSwap" onClick={onImagePick}>
              Replace
            </button>
          )}
        </div>
      )}
      {spec.regions.map((r) => (
        <EditableRegion
          key={`${slide.id}:${r.key}`}
          className={r.className}
          html={slide.blocks[r.key] as string | undefined}
          placeholder={r.placeholder}
          editable={!!editable}
          onChange={(html) => onBlockChange?.(r.key, html)}
          onFocus={() => onRegionFocus?.(r.key)}
        />
      ))}
      {elementLayer ?? (slide.elements?.length ? <StaticElements slide={slide} /> : null)}
    </div>
  );
}

export function textOf(html: string | undefined): string {
  if (!html) return "";
  const el = typeof document !== "undefined" ? document.createElement("div") : null;
  if (!el) return html.replace(/<[^>]+>/g, " ");
  el.innerHTML = sanitizeHtml(html);
  return (el.textContent ?? "").trim();
}

interface EditableRegionProps {
  className: string;
  html?: string;
  placeholder: string;
  editable: boolean;
  onChange: (html: string) => void;
  onFocus: () => void;
}

/* Uncontrolled contentEditable: seeds innerHTML once per slide/value identity and
   reports on blur + input (debounced upstream by the host's save loop). Controlled
   innerHTML would reset the caret on every keystroke. */
function EditableRegion({ className, html, placeholder, editable, onChange, onFocus }: EditableRegionProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const last = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clean = sanitizeHtml(html ?? "");
    if (clean !== last.current && el.innerHTML !== clean) {
      el.innerHTML = clean;
      last.current = clean;
    }
  }, [html]);
  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const v = sanitizeHtml(el.innerHTML);
    last.current = v;
    onChange(v);
  };
  return (
    <div
      ref={ref}
      className={`nxPresRegion ${className}${editable ? " isEditable" : ""}`}
      contentEditable={editable}
      suppressContentEditableWarning
      role={editable ? "textbox" : undefined}
      aria-label={placeholder}
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={editable ? emit : undefined}
      onBlur={editable ? emit : undefined}
      onFocus={editable ? onFocus : undefined}
      spellCheck={editable}
    />
  );
}

/* Non-interactive render of the free-placement layer — filmstrip, present mode,
   viewer and export all paint elements through the same component the editor
   uses, so what you place is exactly what you present. */
function StaticElements({ slide }: { slide: Slide }) {
  return <ElementLayer slide={slide} />;
}
