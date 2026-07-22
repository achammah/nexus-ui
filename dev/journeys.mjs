/* Presentation block — journey driver. Runs against the dev harness (vite :5342)
   in an ISOLATED chromium with real motion (reducedMotion: 'no-preference').
   Asserts VISIBLE outcomes + persisted snapshot state, captures _shots/. */
import { chromium } from "playwright";
import { mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = join(root, "_shots");
mkdirSync(SHOTS, { recursive: true });
const URL0 = "http://localhost:5342/";
const KEY = "presentation:dev-demo";

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "no-preference",
  colorScheme: "light",
});
const page = await ctx.newPage();
const deck = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), KEY);
const shot = (name) => page.screenshot({ path: join(SHOTS, name) });

await page.goto(URL0);
await page.waitForSelector(".nxPresFilmItem");

/* J1 — seed renders: 10 slides, canvas shows title slide */
{
  const film = await page.locator(".nxPresFilmItem").count();
  const title = await page.locator(".nxPresCanvasWell .nxPresTitle").textContent();
  ok("J1 seed renders", film === 10 && /Atlas Q2/.test(title || ""), `film=${film}`);
  await shot("pres-editor-light.png");
}

/* J2 — rich text: select-all + Bold in slide 3 body; typing persists */
{
  await page.locator(".nxPresFilmItem .nxPresFilmIdx").nth(2).click();
  const body = page.locator(".nxPresCanvasWell .nxPresBody");
  await body.click();
  await page.keyboard.press("ControlOrMeta+a");
  /* toggle OFF (selection starts on seeded <b>) then ON across the whole body */
  await page.locator('.nxPresToolbar .nxPresToolBtn[title^="Bold"]').click();
  const afterOff = await page.locator(".nxPresCanvasWell .nxPresBody").innerHTML();
  await page.locator('.nxPresToolbar .nxPresToolBtn[title^="Bold"]').click();
  await page.locator(".nxPresNotesArea").click();
  await page.waitForTimeout(250);
  let d = await deck();
  const html = d.slides[2].blocks.body || "";
  ok("J2a bold toggles + persists", !/<b/i.test(afterOff) && /<b|font-weight/i.test(html), html.slice(0, 60));
  const h = page.locator(".nxPresCanvasWell .nxPresH");
  await h.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" XYZ");
  await page.locator(".nxPresNotesArea").click();
  await page.waitForTimeout(250);
  d = await deck();
  ok("J2b typing persists", (d.slides[2].blocks.title || "").includes("XYZ"));
  await page.locator(".nxPresNotesArea").fill("New note ABC");
  await page.waitForTimeout(250);
  d = await deck();
  ok("J2c notes persist", d.slides[2].notes === "New note ABC");
}

/* J3 — slide CRUD: add quote after sel, duplicate (⌘D), delete btn, move down */
{
  await page.locator('[data-testid="add-quote"]').click();
  await page.waitForTimeout(200);
  let d = await deck();
  ok("J3a add slide", d.slides.length === 11 && d.slides[3].layout === "quote");
  await page.locator(".nxPresFilmItem").nth(3).click(); // focus lands on the (focusable) film item
  await page.keyboard.press("ControlOrMeta+d");
  await page.waitForTimeout(200);
  d = await deck();
  ok("J3b duplicate ⌘D", d.slides.length === 12 && d.slides[4].layout === "quote");
  const item5 = page.locator(".nxPresFilmItem").nth(4);
  await item5.hover();
  await item5.locator('button[title="Delete"]').click();
  await page.waitForTimeout(200);
  d = await deck();
  ok("J3c delete btn", d.slides.length === 11);
  const item4 = page.locator(".nxPresFilmItem").nth(3);
  await item4.hover();
  await item4.locator('button[title="Move down"]').click();
  await page.waitForTimeout(200);
  d = await deck();
  ok("J3d move down", d.slides[4].layout === "quote" && d.slides[3].layout === "two-column");
  /* drag-reorder: drag item 5 (quote) onto item 2 */
  const src = page.locator(".nxPresFilmItem").nth(4);
  const dst = page.locator(".nxPresFilmItem").nth(1);
  const sb = await src.boundingBox();
  const db = await dst.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  d = await deck();
  ok("J3e drag reorder", d.slides[1].layout === "quote", d.slides.map((s) => s.layout).join(","));
  /* clean up the quote (keep deck at 10 for later journeys) */
  const q = page.locator(".nxPresFilmItem").nth(1);
  await q.hover();
  await q.locator('button[title="Delete"]').click();
  await page.waitForTimeout(200);
}

/* J4 — layout + transition switches */
{
  await page.locator(".nxPresFilmItem .nxPresFilmIdx").nth(1).click();
  await page.locator('select[aria-label="Slide layout"]').selectOption("title-body");
  await page.waitForTimeout(150);
  let d = await deck();
  ok("J4a layout switch", d.slides[1].layout === "title-body");
  await page.locator('select[aria-label="Slide layout"]').selectOption("section");
  await page.locator('select[aria-label="Slide transition"]').selectOption("slide");
  await page.waitForTimeout(150);
  d = await deck();
  ok("J4b transition switch", d.slides[1].transition === "slide");
  await page.locator('select[aria-label="Slide transition"]').selectOption("zoom");
}

/* J5 — image slide: file upload lands as data URL */
{
  await page.locator(".nxPresFilmItem .nxPresFilmIdx").nth(4).click();
  const d0 = await deck();
  ok("J5a seed image present", (d0.slides[4].blocks.imageUrl || "").startsWith("data:image/svg"));
  await page.locator(".nxPresCanvasWell .nxPresImageWell").hover();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator(".nxPresCanvasWell .nxPresImageSwap").click(),
  ]);
  // 1x1 red png
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
  await chooser.setFiles({ name: "probe.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(300);
  const d = await deck();
  ok("J5b upload replaces image", (d.slides[4].blocks.imageUrl || "").startsWith("data:image/png"));
  const visible = await page.locator(".nxPresCanvasWell img.nxPresImage").isVisible();
  ok("J5c image visible on canvas", visible);
}

/* J6 — present mode: fullscreen overlay, keyboard nav, REAL animation, presenter view, Esc */
{
  await page.locator(".nxPresFilmItem .nxPresFilmIdx").nth(0).click();
  await page.locator('[data-testid="present-btn"]').click();
  await page.waitForSelector('[data-testid="present-mode"]');
  const count0 = await page.locator(".nxPresPresentCount").first().textContent();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(60);
  /* the entering slide (transition zoom/slide) must have a RUNNING animation */
  const anims = await page.evaluate(() => {
    const el = document.querySelector(".nxPresStageSlide");
    return el ? el.getAnimations({ subtree: true }).length : -1;
  });
  await page.waitForTimeout(400);
  const count1 = await page.locator(".nxPresPresentCount").first().textContent();
  ok("J6a present nav", count0?.trim() === "1 / 10" && count1?.trim() === "2 / 10", `${count0} -> ${count1}`);
  ok("J6b transition animates (no reduced-motion hiding)", anims > 0, `animations=${anims}`);
  await page.keyboard.press("p");
  await page.waitForSelector(".nxPresPresenter");
  const notes = await page.locator(".nxPresPresenterNotes").textContent();
  ok("J6c presenter notes", (notes || "").length > 3, (notes || "").slice(0, 40));
  await shot("pres-present-presenter.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  ok("J6d esc exits", (await page.locator('[data-testid="present-mode"]').count()) === 0);
}

/* J7 — themes re-skin the deck */
{
  await page.locator('select[aria-label="Deck theme"]').selectOption("midnight");
  await page.waitForTimeout(150);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".nxPresCanvasWell .nxPresSlide")).backgroundColor);
  ok("J7a midnight theme applies", bg === "rgb(16, 19, 34)", bg);
  await shot("pres-theme-midnight.png");
  await page.locator('select[aria-label="Deck theme"]').selectOption("gradient");
  await page.waitForTimeout(150);
  await shot("pres-theme-gradient.png");
  await page.locator('select[aria-label="Deck theme"]').selectOption("native");
}

/* J8 — dark mode: chrome + native theme follow tokens */
{
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.waitForTimeout(150);
  const chrome = await page.evaluate(() => getComputedStyle(document.querySelector(".nxPresTop")).backgroundColor);
  const slide = await page.evaluate(() => getComputedStyle(document.querySelector(".nxPresCanvasWell .nxPresSlide")).backgroundColor);
  const dark = (c) => {
    const m = c.match(/\d+/g).map(Number);
    return (m[0] + m[1] + m[2]) / 3 < 100;
  };
  ok("J8 dark mode", dark(chrome) && dark(slide), `chrome=${chrome} slide=${slide}`);
  await shot("pres-editor-dark.png");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
}

/* J9 — share links: create, gate toggle, expiry, disabled; url shape */
{
  await page.getByRole("tab", { name: "Share" }).click();
  await page.waitForSelector('[data-testid="share-panel"]');
  await page.getByRole("button", { name: "New link" }).click();
  await page.waitForTimeout(200);
  let d = await deck();
  ok("J9a link created", d.sharing.links.length === 2, d.sharing.links.map((l) => l.slug).join(","));
  const row = page.locator(".nxPresLinkRow").nth(1);
  await row.locator('input[type="checkbox"]').first().check(); // email gate
  await page.waitForTimeout(150);
  d = await deck();
  ok("J9b email gate toggled", d.sharing.links[1].emailGate === true);
  await row.locator('input[type="date"]').fill("2026-01-01"); // already past -> expired
  await page.waitForTimeout(150);
  d = await deck();
  const expired = Date.parse(d.sharing.links[1].expiresAt) < Date.now();
  ok("J9c expiry set (past)", expired, d.sharing.links[1].expiresAt);
  const urlTxt = await row.locator(".nxPresLinkUrl").textContent();
  ok("J9d share url shape", /#\/share\/.+/.test(urlTxt || ""), urlTxt);
  await shot("pres-share-panel.png");
}

/* J10 — viewer: expired refuses; email gate; nav; analytics fold into snapshot */
{
  const d0 = await deck();
  const expiredSlug = d0.sharing.links[1].slug;
  const gatedSlug = d0.sharing.links[0].slug; // seeded link, emailGate: true
  const sessions0 = d0.analytics.sessions.length;
  await page.goto(`${URL0}#/share/${expiredSlug}`);
  await page.waitForSelector('[data-testid="viewer-gate"]');
  const msg = await page.locator(".nxPresGateMsg").textContent();
  ok("J10a expired link refused", /expired/i.test(msg || ""), msg);
  await page.goto(URL0);
  await page.waitForSelector(".nxPresFilmItem");
  await page.goto(`${URL0}#/share/${gatedSlug}`);
  await page.waitForSelector('[data-testid="viewer-gate"]');
  await shot("pres-viewer-gate.png");
  await page.locator(".nxPresGateInput").fill("probe@example.com");
  await page.getByRole("button", { name: "View presentation" }).click();
  await page.waitForSelector('[data-testid="viewer-player"]');
  await page.waitForTimeout(700); // dwell on slide 1
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await shot("pres-viewer-player.png");
  /* jump to last slide via dots -> completion */
  await page.locator(".nxPresViewerDot").last().click();
  await page.waitForTimeout(600);
  await page.keyboard.press("ArrowLeft"); // flush the last slide's timer through a slide change
  await page.waitForTimeout(300);
  const d = await deck();
  const sess = d.analytics.sessions.find((s) => s.viewerEmail === "probe@example.com");
  ok("J10b session recorded w/ email", !!sess && d.analytics.sessions.length === sessions0 + 1);
  ok("J10c per-slide time tracked", !!sess && Object.values(sess.slideMs).some((ms) => ms >= 400), JSON.stringify(sess?.slideMs || {}).slice(0, 80));
  ok("J10d completion tracked", !!sess && sess.completed === true && sess.maxSlideIndex === d.slides.length - 1);
}

/* J11 — analytics panel renders per-slide bars + sessions */
{
  await page.goto(URL0);
  await page.waitForSelector(".nxPresFilmItem");
  await page.getByRole("tab", { name: "Analytics" }).click();
  await page.waitForSelector('[data-testid="analytics-panel"]');
  const rows = await page.locator(".nxPresAnaRow").count();
  const sess = await page.locator(".nxPresSessRow").count();
  const probe = await page.locator(".nxPresSessWho", { hasText: "probe@example.com" }).count();
  ok("J11 analytics renders", rows === 10 && sess >= 3 && probe === 1, `rows=${rows} sess=${sess}`);
  await shot("pres-analytics.png");
}

/* J12 — data rooms CRUD */
{
  await page.getByRole("tab", { name: "Rooms" }).click();
  await page.waitForSelector('[data-testid="rooms-panel"]');
  await page.getByRole("button", { name: "New room" }).click();
  await page.getByRole("button", { name: "Add item" }).nth(1).click();
  await page.waitForTimeout(200);
  const d = await deck();
  ok("J12 room create + item add", d.rooms.length === 2 && d.rooms[1].items.length === 2);
  await shot("pres-rooms.png");
}

/* J13 — PPTX export: lazy chunk + real .pptx download */
{
  await page.getByRole("tab", { name: "Slides" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "PPTX" }).click(),
  ]);
  const path = await download.path();
  const size = statSync(path).size;
  ok("J13 pptx downloads", download.suggestedFilename().endsWith(".pptx") && size > 20000, `${download.suggestedFilename()} ${size}B`);
}

/* J14 — PDF export opens the print window with one .page per slide */
{
  const [popup] = await Promise.all([
    page.waitForEvent("popup", { timeout: 15000 }),
    page.getByRole("button", { name: "PDF" }).click(),
  ]);
  await popup.waitForTimeout(700);
  const pages = await popup.evaluate(() => document.querySelectorAll(".page").length).catch(() => -1);
  const d = await deck();
  ok("J14 pdf print window", pages === d.slides.length, `pages=${pages}`);
  await popup.close();
}

/* J15 — mobile 390x844: filmstrip rail + usable canvas; viewer */
{
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const filmBox = await page.locator(".nxPresFilm").boundingBox();
  const horizontal = filmBox.width > filmBox.height;
  const canvasBox = await page.locator(".nxPresCanvasWell").boundingBox();
  ok("J15a mobile editor layout", horizontal && canvasBox.width > 300, `film=${Math.round(filmBox.width)}x${Math.round(filmBox.height)}`);
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok("J15b no horizontal page scroll", noHScroll);
  await shot("pres-mobile-editor.png");
  const dd = await deck();
  await page.goto(`${URL0}#/share/${dd.sharing.links[0].slug}`);
  await page.waitForSelector(".nxPresGateInput");
  await page.locator(".nxPresGateInput").fill("m@example.com");
  await page.getByRole("button", { name: "View presentation" }).click();
  await page.waitForSelector('[data-testid="viewer-player"]');
  await shot("pres-mobile-viewer.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL0);
}

/* J16 — a11y structure: roles + focus ring visible on tab */
{
  await page.waitForSelector(".nxPresFilmItem");
  const roles = await page.evaluate(() => ({
    tablist: !!document.querySelector('[role="tablist"]'),
    toolbar: !!document.querySelector('[role="toolbar"]'),
    textboxes: document.querySelectorAll('[contenteditable="true"][role="textbox"]').length,
  }));
  ok("J16 a11y roles", roles.tablist && roles.toolbar && roles.textboxes > 0, JSON.stringify(roles));
}

/* J17 — document history: undo/redo the destructive ops (the old data-loss path) */
{
  await page.goto(URL0);
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.goto(URL0);
  await page.waitForSelector(".nxPresFilmItem");

  /* undo starts disabled — nothing has happened yet */
  ok("J17a undo disabled at rest", await page.locator('[data-testid="undo-btn"]').isDisabled());

  /* the seed only persists once something changes it — add a slide so the
     snapshot (and therefore its slide ids) exist to assert against */
  await page.locator('[data-testid="add-title"]').click();
  const base = await page.locator(".nxPresFilmItem").count();

  /* delete a slide, then undo it back — content identity, not just the count */
  await page.locator(".nxPresFilmItem").nth(2).click();
  const gone = (await deck()).slides[2].id;
  await page.locator(".nxPresFilmItem").nth(2).hover();
  await page.locator(".nxPresFilmItem").nth(2).locator('[aria-label="Delete slide"]').click();
  const afterDel = await page.locator(".nxPresFilmItem").count();
  await page.locator('[data-testid="undo-btn"]').click();
  const restored = await deck();
  ok(
    "J17b undo restores a deleted slide (id + position)",
    afterDel === base - 1 && restored.slides.length === base && restored.slides[2].id === gone,
    `${base} -> ${afterDel} -> ${restored.slides.length}`,
  );

  /* redo re-applies it, and the persisted snapshot follows (not just the DOM) */
  await page.locator('[data-testid="redo-btn"]').click();
  const redone = await deck();
  ok("J17c redo re-deletes + persists", redone.slides.length === base - 1 && !redone.slides.some((x) => x.id === gone));

  /* keyboard ⌘Z from the filmstrip */
  await page.locator(".nxPresFilmItem").first().click();
  await page.keyboard.press("Meta+z");
  ok("J17d cmd+z undoes", (await deck()).slides.length === base);

  /* a new op after undo clears the redo branch */
  await page.locator('[data-testid="add-title"]').click();
  ok("J17e new op clears redo", await page.locator('[data-testid="redo-btn"]').isDisabled());

  /* typing COALESCES: a burst of title keystrokes is ONE undo step, not N */
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.goto(URL0);
  await page.waitForSelector(".nxPresFilmItem");
  const title0 = await page.locator(".nxPresDeckTitle").inputValue();
  await page.locator(".nxPresDeckTitle").click();
  await page.locator(".nxPresDeckTitle").type("XYZ", { delay: 40 });
  await page.locator(".nxPresFilmItem").first().click();
  await page.keyboard.press("Meta+z");
  const t1 = await page.locator(".nxPresDeckTitle").inputValue();
  ok("J17f typing burst coalesces into one undo step", t1 === title0, `"${t1}" === "${title0}"`);

  /* share-link deletion is in the same history */
  await page.getByRole("tab", { name: "Share" }).click();
  await page.getByRole("button", { name: "New link" }).click();
  const withLink = (await deck()).sharing.links.length;
  await page.getByRole("tab", { name: "Slides" }).click();
  await page.locator('[data-testid="undo-btn"]').click();
  ok("J17g share-link create is undoable", (await deck()).sharing.links.length === withLink - 1, `${withLink} -> ${(await deck()).sharing.links.length}`);
  await shot("pres-undo-toolbar.png");
}

const fails = results.filter((r) => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
await browser.close();
process.exit(fails.length ? 1 : 0);
