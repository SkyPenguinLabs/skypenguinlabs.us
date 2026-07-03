process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";

const { expect, test } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const routes = ["/", "/projects/", "/tools/", "/404.html", "/privacy/"];
const footerGroups = ["R&D", "About", "More"];
const footerLinks = [
  "V.I.B.E",
  "FOSS Forest",
  "PakWolf",
  "CTFx",
  "MxOramë",
  "Forms Page",
  "General Product(s)",
  "Courses & eBooks",
  "Utilities Index",
  "Security Tips",
  "War Room",
  "GitHub organization"
];
const warRoomPassages = [
  `:: WAR ROOM PLACEHOLDER ::

The map table is black glass. White pins blink where the old alerts learned to breathe.
No one raises their voice.
Every screen waits for the same impossible green line.`,
  `01:17

The first operator writes: LISTEN BEFORE YOU MOVE.
The second marks the outbound paths with a dull pencil.
Somewhere under the floor, cooling fans count seconds in square waves.`,
  `      /\\        /\\
  ___/  \\______/  \\___
 /__   STONE SIGNAL  __\\
    \\____      ____/
         \\____/

The room answers in plain text:
"Hold the door. Burn the noise. Keep the proof."`,
  `There is no victory banner.

Only a checksum, a timestamp, and the small mercy of a clean diff.
The team copies the evidence twice.
The cursor keeps watch.`,
  `FINAL LINE:
War Room placeholder copy ends here. Replace this story when the real incident chronicle is ready.`
];
const repoRoot = path.resolve(__dirname, "..");
const vibeRoot = path.join(repoRoot, "sites", "vibelang", "public");
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"]
]);

function safeName(route) {
  return route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replaceAll("/", "-").replaceAll(".", "-");
}

async function routeVibeLang(page) {
  await page.route("https://vibelang.skypenguinlabs.com/**", async (route) => {
    const url = new URL(route.request().url());
    const redirectedPaths = new Set(["/docs", "/documentation", "/showcase", "/quickstart"]);
    if (redirectedPaths.has(url.pathname) || url.pathname.startsWith("/docs/")) {
      await route.fulfill({
        status: 301,
        headers: {
          location: "/"
        },
        body: ""
      });
      return;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\//, "");
    const candidate = path.normalize(path.join(vibeRoot, relativePath));
    const target = candidate.startsWith(vibeRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(vibeRoot, relativePath, "index.html");

    if (!target.startsWith(vibeRoot) || !fs.existsSync(target)) {
      await route.fulfill({ status: 404, body: "Not found" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: mimeTypes.get(path.extname(target)) || "application/octet-stream",
      body: fs.readFileSync(target)
    });
  });
}

test.describe("site chrome visual coverage", () => {
  for (const route of routes) {
    test(`${route} renders shared chrome`, async ({ page, isMobile }, testInfo) => {
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (message.text().startsWith("Failed to load resource: the server responded with a status of 404")) return;
        if (message.text().startsWith("Failed to load resource: net::ERR_ADDRESS_UNREACHABLE")) return;
        consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => {
        consoleErrors.push(error.message);
      });

      await page.goto(route, { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("link", { name: "SkyPenguinLabs home" }).first()).toBeVisible();

      if (isMobile) {
        await page.getByRole("button", { name: "Open navigation" }).click();
      }

      const headerNav = page.locator(isMobile ? ".mobile-nav" : ".desktop-nav");
      await expect(headerNav.getByRole("link", { name: "Home", exact: true })).toBeVisible();
      await expect(headerNav.getByRole("button", { name: /R&D/ })).toBeVisible();
      await expect(headerNav.getByRole("button", { name: /Utilities/ })).toBeVisible();
      await expect(headerNav.locator('a[href="https://vibelang.skypenguinlabs.com/"]').filter({ hasText: "V.I.B.E" }).first()).toHaveAttribute("href", "https://vibelang.skypenguinlabs.com/");

      const footer = page.getByRole("contentinfo");
      for (const group of footerGroups) {
        await expect(footer.getByRole("heading", { name: group, exact: true })).toBeVisible();
      }

      for (const link of footerLinks) {
        await expect(footer.getByRole("link", { name: link, exact: true }).last()).toBeVisible();
      }
      await expect(footer.getByRole("link", { name: "V.I.B.E", exact: true }).last()).toHaveAttribute("href", "https://vibelang.skypenguinlabs.com/");

      if (route === "/404.html" || route === "/privacy/") {
        await expect(page.getByRole("heading", { name: "Signal Lost." })).toBeVisible();
        const main = page.getByRole("main");
        await expect(main.getByRole("link", { name: "Home", exact: true })).toBeVisible();
        await expect(main.getByRole("link", { name: "R&D", exact: true })).toBeVisible();
        await expect(main.getByRole("link", { name: "Utilities", exact: true })).toBeVisible();
      }

      if (isMobile) {
        await page.getByRole("button", { name: "Close navigation" }).click();
      }

      await page.screenshot({
        fullPage: true,
        path: `output/visual/screenshots/${testInfo.project.name}-${safeName(route)}.png`
      });

      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe("vibelang subdomain", () => {
  test.beforeEach(async ({ page }) => {
    await routeVibeLang(page);
  });

  test("home renders without main-site chrome", async ({ page }, testInfo) => {
    await page.goto("https://vibelang.skypenguinlabs.com/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "V.I.B.E." })).toBeVisible();
    await expect(page.getByText("Virtualized Intermodular Bytecode Environment")).toBeVisible();
    await expect(page.getByText("field-used R&D language")).toBeVisible();
    await expect(page.getByText("lab-based R&D experiment")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Source to AST to bytecode to VM." })).toBeVisible();
    await expect(page.getByText("Exploit engineers")).toBeVisible();
    await expect(page.getByText("Quantitative analysts")).toBeVisible();
    await expect(page.locator("banner, navigation, contentinfo, .site-header, .site-footer, [data-site-shell]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Explore advanced examples" })).toHaveAttribute("href", "/examples/");
    await expect(page.locator("pre code").first()).toContainText("register(\"std/data/bin\")");
    await expect(page.locator(".hero-media")).toHaveAttribute("src", "/static/assets/vibe-hero-lab.png");

    await page.screenshot({
      fullPage: true,
      path: `output/visual/screenshots/${testInfo.project.name}-vibelang-home.png`
    });
  });

  test("code slideshow controls advance examples", async ({ page }) => {
    await page.goto("https://vibelang.skypenguinlabs.com/", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".slide.is-active")).toContainText("binary + diagnostics");
    await page.getByRole("button", { name: "Next code example" }).click();
    await expect(page.locator(".slide.is-active")).toContainText("semantic units + algebra");
    await page.getByRole("button", { name: "Previous code example" }).click();
    await expect(page.locator(".slide.is-active")).toContainText("binary + diagnostics");
    await expect(page.locator("[data-slide-dots] button")).toHaveCount(4);
  });

  test("examples route renders snippets and fits the viewport", async ({ page, isMobile }, testInfo) => {
    await page.goto("https://vibelang.skypenguinlabs.com/examples/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Nothing here is hello world." })).toBeVisible();
    await expect(page.getByText("01-language-surface.vib")).toBeVisible();
    await expect(page.getByText("02-diagnostics-and-artifacts.vib")).toBeVisible();
    await expect(page.getByText("03-semantic-units-and-heavy-math.vib")).toBeVisible();
    await expect(page.getByText("04-concurrency-orchestration.vib")).toBeVisible();
    await expect(page.getByText("05-statcore-statistics.vib")).toBeVisible();
    await expect(page.getByText("06-media-stack.vib")).toBeVisible();
    await expect(page.getByText("07-optionals-and-taint.vib")).toBeVisible();
    await expect(page.getByText("benchmark command lane")).toBeVisible();
    await expect(page.locator("pre code").filter({ hasText: "SEMANTIC_UNITS_HEAVY_MATH_OK" })).toBeVisible();
    await expect(page.locator("pre code").filter({ hasText: "STATCORE_STATISTICS_OK" })).toBeVisible();

    const metrics = await page.evaluate(() => {
      const examples = Array.from(document.querySelectorAll(".example"));
      return {
        viewportWidth: window.innerWidth,
        bodyScrollWidth: document.documentElement.scrollWidth,
        exampleBoxes: examples.map((node) => node.getBoundingClientRect().toJSON())
      };
    });

    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    for (const box of metrics.exampleBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(isMobile ? 10 : 14);
      expect(box.right).toBeLessThanOrEqual(metrics.viewportWidth - (isMobile ? 10 : 14));
    }

    await page.screenshot({
      fullPage: true,
      path: `output/visual/screenshots/${testInfo.project.name}-vibelang-examples.png`
    });
  });

  test("examples remains live", async ({ page }) => {
    await page.goto("https://vibelang.skypenguinlabs.com/examples/", { waitUntil: "domcontentloaded" });
    expect(page.url()).toBe("https://vibelang.skypenguinlabs.com/examples/");
    await expect(page.getByRole("heading", { name: "Nothing here is hello world." })).toBeVisible();
  });
});

async function waitForWarRoomPassage(page, index) {
  await page.waitForFunction(
    ({ passageIndex }) => {
      const passage = document.querySelector(`[data-passage="${passageIndex}"]`);
      return passage?.dataset.complete === "true";
    },
    { passageIndex: String(index) }
  );
}

async function visibleWarRoomText(page) {
  return page.locator("[data-passage]").evaluateAll((nodes) => nodes.map((node) => node.textContent));
}

test.describe("war room standalone terminal", () => {
  test("types the first passage with a blinking cursor before completion", async ({ page }) => {
    await page.goto("/war-room/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("link", { name: "Go to home" })).toBeVisible();
    await expect(page.locator("[data-cursor]")).toBeVisible();
    await page.waitForFunction(
      (expectedText) => {
        const passage = document.querySelector('[data-passage="0"]');
        if (!passage) return false;
        const text = passage.textContent || "";
        return passage.dataset.complete === "false" && text.length > 4 && text.length < expectedText.length;
      },
      warRoomPassages[0]
    );

    const inProgressText = await page.locator('[data-passage="0"]').textContent();
    expect(warRoomPassages[0].startsWith(inProgressText)).toBe(true);

    const cursorAnimation = await page.locator("[data-cursor]").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration
      };
    });
    expect(cursorAnimation.animationName).toBe("blink");
    expect(cursorAnimation.animationDuration).not.toBe("0s");
  });

  test("loads without shared chrome and renders exact passage text", async ({ page }, testInfo) => {
    await page.goto("/war-room/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-war-room]")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
    await expect(page.locator("banner, navigation, contentinfo, .site-header, .site-footer, [data-site-shell]")).toHaveCount(0);
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);

    await waitForWarRoomPassage(page, 0);
    await expect(page.locator('[data-passage="0"]')).toHaveText(warRoomPassages[0]);

    for (let index = 1; index < warRoomPassages.length; index += 1) {
      await page.keyboard.press("Space");
      await waitForWarRoomPassage(page, index);
      await expect(page.locator(`[data-passage="${index}"]`)).toHaveText(warRoomPassages[index]);
    }

    await expect(page.locator("[data-cursor]")).toBeVisible();
    await expect(page.locator("[data-war-room]")).toHaveAttribute("data-story-complete", "true");
    await expect(page.locator("body")).not.toContainText("[pause=");
    expect(await visibleWarRoomText(page)).toEqual(warRoomPassages);

    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await page.mouse.click(80, 80);
    await expect(page.locator("[data-passage]")).toHaveCount(warRoomPassages.length);
    expect(await visibleWarRoomText(page)).toEqual(warRoomPassages);

    await page.screenshot({
      fullPage: true,
      path: `output/visual/screenshots/${testInfo.project.name}-war-room-complete.png`
    });
  });

  test("accepts Enter, click, and tap only after typing completes", async ({ page, isMobile }) => {
    await page.goto("/war-room/", { waitUntil: "domcontentloaded" });

    await page.keyboard.press("Enter");
    await expect(page.locator("[data-passage]")).toHaveCount(1);
    await waitForWarRoomPassage(page, 0);

    await page.keyboard.press("Enter");
    await waitForWarRoomPassage(page, 1);
    expect(await visibleWarRoomText(page)).toEqual(warRoomPassages.slice(0, 2));

    await page.mouse.click(120, 120);
    await waitForWarRoomPassage(page, 2);
    expect(await visibleWarRoomText(page)).toEqual(warRoomPassages.slice(0, 3));

    if (isMobile) {
      await page.touchscreen.tap(180, 420);
      await waitForWarRoomPassage(page, 3);
      expect(await visibleWarRoomText(page)).toEqual(warRoomPassages.slice(0, 4));
    }
  });

  test("reduced motion renders passages instantly while preserving manual advance", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/war-room/", { waitUntil: "domcontentloaded" });

    await waitForWarRoomPassage(page, 0);
    await expect(page.locator('[data-passage="0"]')).toHaveText(warRoomPassages[0]);
    await expect(page.locator("[data-passage]")).toHaveCount(1);

    await page.keyboard.press("Space");
    await waitForWarRoomPassage(page, 1);
    await expect(page.locator('[data-passage="1"]')).toHaveText(warRoomPassages[1]);
  });

  test("keeps terminal text readable inside the viewport", async ({ page, isMobile }, testInfo) => {
    await page.goto("/war-room/", { waitUntil: "domcontentloaded" });
    await waitForWarRoomPassage(page, 0);

    const metrics = await page.evaluate(() => {
      const stage = document.querySelector("[data-war-room]");
      const terminal = document.querySelector(".terminal");
      const output = document.querySelector("[data-terminal-output]");
      const passage = document.querySelector("[data-passage]");
      const bodyStyle = getComputedStyle(document.body);
      const stageStyle = getComputedStyle(stage);
      const passageStyle = getComputedStyle(passage);
      const accentStyle = getComputedStyle(document.querySelector(".accent"));
      const statusStyle = getComputedStyle(document.querySelector("[data-terminal-status]"));
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const terminalBox = terminal.getBoundingClientRect();
      const outputBox = output.getBoundingClientRect();
      const passageBox = passage.getBoundingClientRect();
      const accentBox = document.querySelector(".accent").getBoundingClientRect();
      const statusBox = document.querySelector("[data-terminal-status]").getBoundingClientRect();

      return {
        viewport,
        terminalBox: terminalBox.toJSON(),
        outputBox: outputBox.toJSON(),
        passageBox: passageBox.toJSON(),
        accentBox: accentBox.toJSON(),
        statusBox: statusBox.toJSON(),
        bodyBackground: bodyStyle.backgroundColor,
        stageBackground: stageStyle.backgroundColor,
        passageColor: passageStyle.color,
        accentColor: accentStyle.color,
        statusColor: statusStyle.color,
        fontFamily: passageStyle.fontFamily,
        activeElementTag: document.activeElement.tagName,
        focusableControls: document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])").length,
        homeBox: document.querySelector(".home-link").getBoundingClientRect().toJSON()
      };
    });

    expect(metrics.bodyBackground).toBe("rgb(0, 0, 0)");
    expect(metrics.stageBackground).toBe("rgb(0, 0, 0)");
    expect(metrics.passageColor).toBe("rgb(244, 244, 244)");
    expect(["rgb(154, 154, 154)", "rgb(244, 244, 244)"]).toContain(metrics.accentColor);
    expect(["rgb(154, 154, 154)", "rgb(244, 244, 244)"]).toContain(metrics.statusColor);
    expect(metrics.fontFamily.toLowerCase()).toContain("monospace");
    expect(metrics.focusableControls).toBe(1);

    const margin = isMobile ? 10 : 18;
    expect(metrics.terminalBox.left).toBeGreaterThanOrEqual(margin - 1);
    expect(metrics.terminalBox.right).toBeLessThanOrEqual(metrics.viewport.width - margin + 1);
    expect(metrics.terminalBox.top).toBeGreaterThanOrEqual(margin - 1);
    expect(metrics.terminalBox.bottom).toBeLessThanOrEqual(metrics.viewport.height - margin + 1);
    expect(metrics.passageBox.left).toBeGreaterThanOrEqual(metrics.outputBox.left - 1);
    expect(metrics.passageBox.right).toBeLessThanOrEqual(metrics.outputBox.right + 1);
    expect(metrics.passageBox.top).toBeGreaterThanOrEqual(metrics.outputBox.top - 1);
    expect(metrics.passageBox.bottom).toBeLessThanOrEqual(metrics.outputBox.bottom + 1);
    expect(metrics.accentBox.bottom).toBeLessThanOrEqual(metrics.outputBox.top - 6);
    expect(metrics.outputBox.bottom).toBeLessThanOrEqual(metrics.statusBox.top - 6);
    expect(metrics.statusBox.bottom).toBeLessThanOrEqual(metrics.homeBox.top - 6);

    const passageCenterY = (metrics.passageBox.top + metrics.passageBox.bottom) / 2;
    const outputCenterY = (metrics.outputBox.top + metrics.outputBox.bottom) / 2;
    expect(Math.abs(passageCenterY - outputCenterY)).toBeLessThan(metrics.outputBox.height * 0.24);

    await page.screenshot({
      fullPage: true,
      path: `output/visual/screenshots/${testInfo.project.name}-war-room-readable.png`
    });
  });
});
