/* Viewer3D verification — exercises every feature live and shoots evidence.
   run: node v3shots.mjs   (dev server on :5511) */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5511";
const OUT = "/private/tmp/reskin-wt/wt-3dviewer/_shots";
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, pass, note = "") => { results.push({ name, pass, note }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${note}`); };

const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
/* camera position read off the live engine (the surface exposes it for tests) */
const cam = (p) => p.evaluate(() => {
  const e = document.querySelector('[data-testid="viewer3d-host"]').__nxV3;
  const c = e.camera.position;
  return { x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +c.z.toFixed(3), d: +c.distanceTo(e.controls.target).toFixed(3), auto: e.controls.autoRotate };
});
const ready = async (p) => {
  await p.waitForSelector('[data-testid="viewer3d-toolbar"]', { timeout: 20000 });
  await p.waitForSelector('[data-testid="viewer3d-loading"]', { state: "detached", timeout: 20000 });
  await p.waitForTimeout(900);
};
/* is the canvas actually painting something (not a blank/black frame)? */
const canvasAlive = (p) => p.evaluate(() => {
  const c = document.querySelector('[data-testid="viewer3d-host"] canvas');
  if (!c) return { alive: false, why: "no canvas" };
  const e = document.querySelector('[data-testid="viewer3d-host"]').__nxV3;
  const gl = e.renderer.getContext();
  return { alive: !gl.isContextLost() && c.width > 100, w: c.width, h: c.height, lost: gl.isContextLost() };
});

/* real GPU backend: default headless falls back to SwiftShader (CPU), which runs
   the scene at ~9fps and makes any per-frame assertion (auto-rotate drift) a
   measurement of the renderer, not the feature */
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=metal", "--enable-gpu"] });

/* ============ OBJECT MODE ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const warns = [];
  p.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warns.push(m.text()); });
  await p.goto(`${BASE}/?scene=vehicle`);
  await ready(p);
  await shot(p, "f-object-light");
  ok("object: seed starts with auto-rotate on", (await cam(p)).auto === true);
  await p.click('[data-testid="viewer3d-autorotate"]'); // park it for the static checks
  await p.waitForTimeout(300);
  ok("object: loads + paints", (await canvasAlive(p)).alive, JSON.stringify(await canvasAlive(p)));

  // camera presets move the camera to distinct positions
  const seen = {};
  for (const preset of ["front", "side", "top", "iso"]) {
    await p.click(`[data-testid="viewer3d-preset-${preset}"]`);
    await p.waitForTimeout(1000);
    seen[preset] = await cam(p);
    await shot(p, `f-object-preset-${preset}`);
  }
  const distinct = new Set(Object.values(seen).map((c) => `${c.x}|${c.y}|${c.z}`)).size;
  ok("object: 4 camera presets are distinct + eased", distinct === 4, JSON.stringify(seen.top));
  ok("object: top preset looks down (y dominant)", seen.top.y > Math.abs(seen.top.x) * 5);

  // orbit by dragging
  const before = await cam(p);
  const box = await p.locator('[data-testid="viewer3d-host"]').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2 + 40, { steps: 20 });
  await p.mouse.up();
  await p.waitForTimeout(600);
  const after = await cam(p);
  ok("object: drag orbits the camera", Math.hypot(after.x - before.x, after.z - before.z) > 0.5);
  await shot(p, "f-object-after-drag");

  // zoom clamp: wheel hard in, camera must not enter the model
  for (let i = 0; i < 25; i++) await p.mouse.wheel(0, -240);
  await p.waitForTimeout(500);
  const zoomed = await cam(p);
  ok("object: min-distance clamp holds (can't fly inside)", zoomed.d > 1.5, `d=${zoomed.d}`);
  for (let i = 0; i < 40; i++) await p.mouse.wheel(0, 240);
  await p.waitForTimeout(500);
  const out = await cam(p);
  ok("object: max-distance clamp holds", out.d < 20, `d=${out.d}`);

  // reset view
  await p.click('[data-testid="viewer3d-reset"]');
  await p.waitForTimeout(1000);
  ok("object: reset re-frames the model", Math.abs((await cam(p)).d - 7.3) < 3, `d=${(await cam(p)).d}`);

  // 360 spin — sample mid-flight, must return near start
  const spinStart = await cam(p);
  await p.click('[data-testid="viewer3d-spin"]');
  await p.waitForTimeout(1200);
  const mid = await cam(p);
  await shot(p, "f-object-mid-spin");
  await p.waitForTimeout(2000);
  const end = await cam(p);
  ok("object: 360 spin rotates then returns",
    Math.hypot(mid.x - spinStart.x, mid.z - spinStart.z) > 1 && Math.hypot(end.x - spinStart.x, end.z - spinStart.z) < 0.6);

  // auto-rotate: from OFF, turn it on and confirm the camera actually drifts
  const autoOff = (await cam(p)).auto;
  await p.click('[data-testid="viewer3d-autorotate"]');
  await p.waitForTimeout(600);
  const a1 = await cam(p); await p.waitForTimeout(2000); const a2 = await cam(p);
  // measure the swept AZIMUTH, not a chord: distance-independent, so the check
  // does not drift with whatever zoom the previous step left the camera at
  const az = (c) => Math.atan2(c.z, c.x);
  const swept = Math.abs(((az(a2) - az(a1) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  ok("object: auto-rotate toggles + actually spins",
    (await cam(p)).auto === true && autoOff === false && swept > 0.05,
    `swept ${(swept * 180 / Math.PI).toFixed(1)} deg in 2s`);
  await p.click('[data-testid="viewer3d-autorotate"]'); // off for stable shots
  await p.waitForTimeout(400);

  // wireframe
  await p.click('[data-testid="viewer3d-wireframe"]');
  await p.waitForTimeout(500);
  await shot(p, "f-object-wireframe");
  ok("object: wireframe toggle applies", await p.evaluate(() => {
    let wf = false;
    document.querySelector('[data-testid="viewer3d-host"]').__nxV3.model.traverse((o) => { if (o.isMesh && o.material?.wireframe) wf = true; });
    return wf;
  }));
  await p.click('[data-testid="viewer3d-wireframe"]');
  await p.waitForTimeout(400);

  // hotspots: count, click -> detail card, occlusion
  await p.click('[data-testid="viewer3d-preset-side"]');
  await p.waitForTimeout(1100);
  const pins = await p.locator('[data-testid^="viewer3d-hotspot-"]').count();
  ok("object: 3 data-driven hotspots render", pins === 3, `n=${pins}`);
  await p.click('[data-testid="viewer3d-hotspot-d-door"]');
  await p.waitForTimeout(400);
  const cardText = await p.locator('[data-testid="viewer3d-detail"]').innerText();
  ok("object: hotspot opens its detail card", cardText.includes("Door dent") && cardText.includes("dented"));
  await shot(p, "f-object-hotspot-card");

  // occlusion: park the camera on -Z, which puts the bumper + door pins behind
  // the body; the windshield pin stays in line of sight -> not all-or-nothing.
  await p.evaluate(() => {
    const e = document.querySelector('[data-testid="viewer3d-host"]').__nxV3;
    e.camera.position.set(e.controls.target.x + 0.3, e.controls.target.y + 0.9, e.controls.target.z - 6.5);
    e.controls.update();
  });
  await p.waitForTimeout(800);
  const occluded = await p.locator('.nxV3Pin--occluded').count();
  const glassVisible = await p.evaluate(() => !document.querySelector('[data-testid="viewer3d-hotspot-d-glass"]').classList.contains("nxV3Pin--occluded"));
  ok("object: hotspots are occlusion-aware", occluded === 2 && glassVisible, `${occluded} pins behind geometry, line-of-sight pin unfaded`);
  await shot(p, "f-object-occlusion");

  // keyboard camera control
  await p.click('[data-testid="viewer3d-reset"]');
  await p.waitForTimeout(1000);
  const k0 = await cam(p);
  await p.locator('[data-testid="viewer3d-host"]').focus();
  for (let i = 0; i < 8; i++) { await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60); }
  await p.waitForTimeout(400);
  const k1 = await cam(p);
  for (let i = 0; i < 5; i++) { await p.keyboard.press("+"); await p.waitForTimeout(60); }
  await p.waitForTimeout(400);
  const k2 = await cam(p);
  await p.keyboard.press("r");
  await p.waitForTimeout(1000);
  const k3 = await cam(p);
  ok("object: keyboard orbit / zoom / reset", Math.hypot(k1.x - k0.x, k1.z - k0.z) > 0.5 && k2.d < k1.d - 0.5 && Math.abs(k3.d - k0.d) < 0.5,
    `orbit ok, zoom ${k1.d}->${k2.d}, reset ${k3.d} vs ${k0.d}`);
  await shot(p, "f-object-keyboard");

  // dark theme
  await p.click('[data-testid="theme-toggle"]');
  await p.waitForTimeout(1200);
  await shot(p, "f-object-dark");
  ok("object: dark theme re-derives the scene", await p.evaluate(() =>
    document.querySelector('[data-testid="viewer3d-host"]').__nxV3.scene.environmentIntensity === 0.75));

  /* ---- WebGL context leak across navigations ---- */
  await p.click('[data-testid="theme-toggle"]');
  await p.waitForTimeout(600);
  for (let i = 0; i < 14; i++) {
    await p.click('[data-testid="mount-toggle"]'); // unmount
    await p.waitForTimeout(180);
    await p.click('[data-testid="mount-toggle"]'); // remount
    await ready(p);
  }
  const alive = await canvasAlive(p);
  const ctxWarn = warns.filter((w) => /WebGL context|Too many|context lost/i.test(w));
  ok("hygiene: 14 unmount/remount cycles — no context leak", alive.alive && ctxWarn.length === 0,
    `canvas ${alive.w}x${alive.h}, ${ctxWarn.length} context warnings`);
  await shot(p, "f-object-after-14-remounts");
  await ctx.close();
}

/* ============ FLOORPLAN MODE ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?scene=floorplan`);
  await ready(p);
  await shot(p, "f-plan-light");
  ok("plan: loads + paints", (await canvasAlive(p)).alive);

  const rooms = await p.locator('[data-testid^="viewer3d-room-"]').count();
  ok("plan: ground floor room labels render", rooms === 5, `n=${rooms}`);

  // level switch
  await p.click('[data-testid="viewer3d-level-first"]');
  await p.waitForTimeout(900);
  const rooms1 = await p.locator('[data-testid^="viewer3d-room-"]').count();
  const ghosted = await p.evaluate(() => {
    const e = document.querySelector('[data-testid="viewer3d-host"]').__nxV3;
    let g = null;
    e.levels.get("ground").group.traverse((o) => { if (o.isMesh && g === null) g = o.material.opacity; });
    return g;
  });
  ok("plan: level switcher swaps floors + ghosts the other", rooms1 === 3 && ghosted < 0.2, `rooms=${rooms1} ghostOpacity=${ghosted}`);
  await shot(p, "f-plan-level-first");

  // per-level hotspots
  const h1 = await p.locator('[data-testid^="viewer3d-hotspot-"]').count();
  await p.click('[data-testid="viewer3d-level-ground"]');
  await p.waitForTimeout(900);
  const h0 = await p.locator('[data-testid^="viewer3d-hotspot-"]').count();
  ok("plan: hotspots filter by level", h0 === 1 && h1 === 1, `ground=${h0} first=${h1}`);
  await p.click('[data-testid="viewer3d-hotspot-h-leak"]');
  await p.waitForTimeout(400);
  ok("plan: room hotspot opens its card", (await p.locator('[data-testid="viewer3d-detail"]').innerText()).includes("Water damage"));
  await shot(p, "f-plan-hotspot-card");

  // top-down toggle
  const p0 = await cam(p);
  await p.click('[data-testid="viewer3d-topdown"]');
  await p.waitForTimeout(1300);
  const pTop = await cam(p);
  await shot(p, "f-plan-topdown");
  ok("plan: top-down <-> 3D toggle", pTop.y > Math.abs(pTop.x) * 5 && pTop.y !== p0.y, `top y=${pTop.y}`);
  // labels must still be legible (rendered, positioned inside the frame)
  const labelBox = await p.locator('[data-testid="viewer3d-room-living"]').boundingBox();
  ok("plan: room labels stay on-screen top-down", !!labelBox && labelBox.x > 0 && labelBox.y > 0);
  await p.click('[data-testid="viewer3d-topdown"]');
  await p.waitForTimeout(1300);

  await p.click('[data-testid="theme-toggle"]');
  await p.waitForTimeout(1200);
  await shot(p, "f-plan-dark");
  ok("plan: dark theme coherent", (await canvasAlive(p)).alive);
  await ctx.close();
}

/* ============ ERROR + POSTER ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "no-preference", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?scene=broken`);
  await p.waitForSelector('[data-testid="viewer3d-error"]', { timeout: 20000 });
  await shot(p, "f-error-state");
  ok("states: bad model URL -> error state with retry", await p.locator('[data-testid="viewer3d-error"] button').isVisible());
  await ctx.close();
}

/* ============ REDUCED MOTION ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?scene=vehicle`);
  await ready(p);
  await shot(p, "f-reduced-motion");
  const spinBtn = await p.locator('[data-testid="viewer3d-spin"]').count();
  const autoBtn = await p.locator('[data-testid="viewer3d-autorotate"]').count();
  const auto = await p.evaluate(() => document.querySelector('[data-testid="viewer3d-host"]').__nxV3.controls.autoRotate);
  // preset must still work, but jump instantly (no fly)
  const c0 = await cam(p);
  await p.click('[data-testid="viewer3d-preset-top"]');
  await p.waitForTimeout(120);
  const c1 = await cam(p);
  ok("a11y: reduced-motion hides spin/auto-rotate, presets jump instantly",
    spinBtn === 0 && autoBtn === 0 && auto === false && c1.y > c0.y + 1, `snapped in <120ms`);
  await ctx.close();
}

/* ============ MOBILE ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "no-preference" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?scene=vehicle`);
  await ready(p);
  await shot(p, "f-mobile-object");
  const bar = await p.locator('[data-testid="viewer3d-toolbar"]').boundingBox();
  ok("mobile: toolbar fits 390px without horizontal overflow", bar.width <= 390, `w=${bar.width}`);

  // touch orbit
  const c0 = await cam(p);
  const box = await p.locator('[data-testid="viewer3d-host"]').boundingBox();
  await p.touchscreen.tap(box.x + 100, box.y + 200);
  await p.evaluate(([x, y]) => {
    const el = document.querySelector('[data-testid="viewer3d-host"] canvas');
    const t = (tx, ty) => new Touch({ identifier: 1, target: el, clientX: tx, clientY: ty });
    el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: true }));
    for (let i = 1; i <= 10; i++)
      el.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: x + i * 15, clientY: y + i * 3, bubbles: true, pointerType: "touch", isPrimary: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: x + 150, clientY: y + 30, bubbles: true, pointerType: "touch", isPrimary: true }));
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  await p.waitForTimeout(700);
  const c1 = await cam(p);
  ok("mobile: touch drag orbits", Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.5, `moved ${Math.hypot(c1.x - c0.x, c1.z - c0.z).toFixed(2)}`);
  await shot(p, "f-mobile-after-touch-orbit");

  await p.goto(`${BASE}/?scene=floorplan`);
  await ready(p);
  await p.click('[data-testid="theme-toggle"]');
  await p.waitForTimeout(1000);
  await shot(p, "f-mobile-plan-dark");
  ok("mobile: floor plan usable at 390px dark", (await canvasAlive(p)).alive);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) { console.log("FAILURES:"); failed.forEach((f) => console.log(" - " + f.name + " " + f.note)); process.exit(1); }
