const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.FORMATTER_URL || pathToFileURL(path.resolve(__dirname, "../index.html")).href);
    await page.waitForTimeout(450);
    assert(await page.locator("#copyRich").isDisabled());
    assert(await page.locator(".ui-icon").evaluateAll((icons) => icons.every((icon) => icon.complete && icon.naturalWidth > 0)), "Local toolbar icons should render");
    await page.screenshot({ path: path.join(os.tmpdir(), "formatter-empty.png") });

    await page.locator("#loadSample").click();
    assert(await page.locator("#copyRich").isEnabled());
    const moving = await page.evaluate(() => ({
      active: document.getAnimations().length,
      outside: [...document.querySelectorAll(".motion-snapshot")].every((el) => el.parentElement === document.body && el.inert && el.getAttribute("aria-hidden") === "true"),
    }));
    assert(moving.active > 0 && moving.outside, "Content updates should animate outside the exported article");
    await page.evaluate(async () => {
      window.ClipboardItem = class { constructor(items) { this.items = items; } };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        write: async (items) => { window.copiedMotionHtml = await items[0].items["text/html"].text(); },
      } });
      await copyRich();
    });
    const copied = await page.evaluate(() => window.copiedMotionHtml);
    assert(copied.includes("飞书原文格式自适应转换") && !/motion-snapshot|animation:|aria-hidden/.test(copied));

    await page.evaluate(() => {
      for (let index = 0; index < 12; index++) {
        document.querySelector('[data-wechat-style="' + (index % 2 ? "knowledge" : "editorial") + '"]').click();
      }
    });
    await page.waitForFunction(() => document.querySelectorAll(".motion-snapshot").length === 0, undefined, { timeout: 2000 });
    assert.equal(await page.locator(".motion-snapshot").count(), 0, "Rapid updates must clean outgoing snapshots");
    assert.equal(await page.locator('[data-wechat-style="knowledge"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".mode-switch").getAttribute("data-mode"), "smart");
    assert((await page.locator("#preview").innerHTML()).includes("#0f766e"));
    await page.screenshot({ path: path.join(os.tmpdir(), "formatter-desktop.png"), fullPage: true });

    await page.locator("summary").click();
    await page.waitForTimeout(60);
    await page.evaluate(() => document.querySelector("summary").click());
    await page.waitForTimeout(300);
    assert.equal(await page.locator("details").getAttribute("open"), null, "Interrupted accordion should finish closed");
    await page.locator("summary").press("Enter");
    await page.waitForTimeout(300);
    assert(await page.locator(".intro-expansion").isVisible());
    await page.locator("summary").click();
    await page.waitForTimeout(300);

    await page.locator("#clearButton").click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".motion-snapshot").count(), 0);
    assert(await page.locator("#copyRich").isDisabled());
    assert.equal(await page.locator("#wordCount").innerText(), "0 字");
    assert(await page.locator("#rawEditor").evaluate((el) => el === document.activeElement));

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#loadSample").click();
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.equal(await page.locator(".motion-snapshot").count(), 0);
    await page.locator("summary").click();
    assert(await page.locator(".intro-expansion").isVisible());
    await page.locator("summary").click();

    for (const width of [320, 390, 768, 1120, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow at " + width);
      const overlaps = await page.locator(".panel-head").evaluateAll((heads) => heads.some((head) => {
        const a = head.firstElementChild.getBoundingClientRect();
        const b = head.lastElementChild.getBoundingClientRect();
        return head.children.length > 1 && a.right > b.left && a.bottom > b.top && b.bottom > a.top;
      }));
      assert(!overlaps, "Header controls overlap at " + width);
      if (width === 390) await page.screenshot({ path: path.join(os.tmpdir(), "formatter-mobile.png"), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log("UI checks passed: entry/exit, rapid replacement, accordion interruption, clipboard isolation, reduced motion, 320/390/768/1120/1440px layout.");
    console.log("Screenshots: " + path.join(os.tmpdir(), "formatter-{empty,desktop,mobile}.png"));
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
