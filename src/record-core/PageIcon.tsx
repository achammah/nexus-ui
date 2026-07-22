import * as React from "react";

/* PageIcon — one renderer for a page's icon, wherever it appears (page header, tree row,
   breadcrumb, backlink, quick-switcher, sub-page block).

   An icon is a STRING so it stays trivially persistable inside the page store:
     - an emoji  → rendered as text by the system emoji font
     - a `data:` URI → an UPLOADED custom icon, rendered as an <img>
   Uploads are stored as data URIs on purpose: they survive the store round-trip with no
   file service, and they are CSP-safe (no external host, no blob lifetime to manage). */

export const isImageIcon = (icon?: string): boolean => !!icon && icon.startsWith("data:");

export function PageIcon({ icon, size = 16, className, fallback }: {
  icon?: string;
  size?: number;
  className?: string;
  fallback?: React.ReactNode;
}) {
  if (!icon) return <>{fallback ?? null}</>;
  if (isImageIcon(icon)) {
    return (
      <img className={["nxPageIcon", className].filter(Boolean).join(" ")} src={icon} alt="" aria-hidden
        style={{ width: size, height: size, objectFit: "cover", borderRadius: Math.max(3, Math.round(size * 0.18)), display: "block", flex: "none" }} />
    );
  }
  return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

/* Downscale an uploaded image to a square icon and return a data URI. Keeping it small
   matters: the page store persists as ONE blob, so a full-resolution upload would bloat
   every save. 128px covers the largest place an icon is drawn (the page header). */
export async function fileToIconDataUri(file: File, px = 128): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
  // SVG has no intrinsic raster size worth re-encoding — keep it as-is
  if (file.type === "image/svg+xml") return dataUrl;
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("That file is not a readable image."));
    i.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d");
  if (!ctx) return dataUrl;
  // cover-crop to a square so the icon is never letterboxed
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, px, px);
  return c.toDataURL("image/png");
}

export default PageIcon;
