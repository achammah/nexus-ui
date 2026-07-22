/* The lead's audit instrument, run against the block itself:
   1. visible <select> count (target 0)
   2. full-width bands between the surface root and the content (target 1)
   3. canvas fill ratio against its parent (target ~1.0 x ~1.0 minus own chrome) */
import { chromium } from "playwright";
const b = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference", colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5342/");
  await p.evaluate((k) => localStorage.removeItem(k), "presentation:dev-demo");
  await p.goto("http://localhost:5342/");
  await p.waitForSelector(".nxPresFilmItem");
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
    const selects = [...document.querySelectorAll("select")].filter(vis);
    const root = document.querySelector(".nxPres");
    const rootRect = root.getBoundingClientRect();
    /* a "band" = a direct-ish descendant spanning ~the full surface width and
       stacked ABOVE the content area */
    const editor = document.querySelector(".nxPresEditor");
    const editorTop = editor ? editor.getBoundingClientRect().top : rootRect.bottom;
    const bands = [...root.querySelectorAll("*")].filter((el) => {
      const b = el.getBoundingClientRect();
      if (!vis(el)) return false;
      if (b.width < rootRect.width * 0.9) return false;
      if (b.height < 8 || b.height > 120) return false;
      return b.bottom <= editorTop + 1;
    }).map((el) => ({ cls: el.className.toString().split(" ")[0], h: Math.round(el.getBoundingClientRect().height) }));
    const well = document.querySelector(".nxPresCanvasWell");
    const main = document.querySelector(".nxPresMain");
    const clip = document.querySelector(".nxPresCanvas .nxPresFitClip");
    const wr = well.getBoundingClientRect(), mr = main.getBoundingClientRect(), cr = clip.getBoundingClientRect();
    return {
      selects: selects.length,
      selectDetail: selects.map((s) => s.getAttribute("aria-label") || s.className),
      bands,
      stageFillOfMain: { w: +(wr.width / mr.width).toFixed(2), h: +(wr.height / mr.height).toFixed(2) },
      slideFillOfStage: { w: +(cr.width / wr.width).toFixed(2), h: +(cr.height / wr.height).toFixed(2) },
      slidePx: { w: Math.round(cr.width), h: Math.round(cr.height) },
      stagePx: { w: Math.round(wr.width), h: Math.round(wr.height) },
    };
  });
  console.log(scheme, JSON.stringify(r));
  await ctx.close();
}
await b.close();
