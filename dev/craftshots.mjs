import { chromium } from "playwright";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = join(root, "_shots");
const tag = process.argv[2] || "after";
const KEY = "presentation:dev-demo";
const b = await chromium.launch();
for (const scheme of ["light","dark"]) {
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, reducedMotion:"no-preference", colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5342/");
  await p.evaluate(k=>localStorage.removeItem(k), KEY);
  await p.goto("http://localhost:5342/");
  await p.waitForSelector(".nxPresFilmItem");
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(SHOTS, `craft-${tag}-${scheme}.png`) });
  if (scheme === "light") {
    // contextual text bar
    await p.locator(".nxPresCanvasWell .nxPresRegion").first().click();
    await p.waitForSelector('[data-testid="text-format-bar"]');
    await p.screenshot({ path: join(SHOTS, `craft-${tag}-textbar.png`) });
    // element bar + insert menu
    const n = await p.locator(".nxPresFilmItem").count();
    for (let i=0;i<n;i++){ await p.locator(".nxPresFilmItem").nth(i).click(); if (await p.locator(".nxPresCanvas .nxPresEl-shape").count()) break; }
    await p.locator(".nxPresCanvas .nxPresEl-shape").first().click();
    await p.waitForSelector('[data-testid="element-bar"]');
    await p.screenshot({ path: join(SHOTS, `craft-${tag}-elementbar.png`) });
    await p.locator('[data-testid="insert-menu"]').click();
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(SHOTS, `craft-${tag}-insertmenu.png`) });
  }
  await ctx.close();
}
const ctx = await b.newContext({ viewport:{width:390,height:844}, reducedMotion:"no-preference" });
const p = await ctx.newPage();
await p.goto("http://localhost:5342/"); await p.waitForSelector(".nxPresFilmItem"); await p.waitForTimeout(400);
await p.screenshot({ path: join(SHOTS, `craft-${tag}-mobile.png`) });
await b.close();
console.log("shots:", tag);
