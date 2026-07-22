import { chromium } from "playwright";
const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:1440,height:900}, reducedMotion:"no-preference"})).newPage();
await p.goto("http://localhost:5342/"); await p.waitForSelector(".nxPresFilmItem");
const n = await p.locator(".nxPresFilmItem").count();
for (let i=0;i<n;i++){ await p.locator(".nxPresFilmItem").nth(i).click(); if (await p.locator(".nxPresCanvas .nxPresEl-shape").count()) break; }
await p.locator(".nxPresCanvas .nxPresEl-shape").first().click();
await p.waitForSelector('[data-testid="element-bar"]');
await p.waitForTimeout(900);
const boxes = await p.evaluate(()=>{
  const g=(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height), pos:getComputedStyle(e).position};};
  return { main:g(".nxPresMain"), well:g(".nxPresCanvasWell"), notes:g(".nxPresNotes"), bar:g('[data-testid="element-bar"]') };
});
console.log(JSON.stringify(boxes,null,1));
await p.screenshot({path:"_shots/probe-notes.png"});
await b.close();
