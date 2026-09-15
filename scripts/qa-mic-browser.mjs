/**
 * Browser QA for mic flow against isolated QA (:3011 + :8011).
 * record → stop → transcript → auto-send → agent response
 * + send failure: draft kept, retry, no double-send
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw-deps/node_modules/playwright");
import { readFileSync } from "node:fs";

const APP = process.env.QA_APP_URL || "http://127.0.0.1:3011";
const UNIQUE = `מיקרופון-QA-${Date.now()}`;

const results = [];
function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`${status === "PASS" ? "✓" : "✗"} ${id}: ${status} — ${detail}`);
}

async function dismissOnboarding(page) {
  const skipBtn = page.getByRole("button", { name: "דילוג לעכשיו" });
  if (await skipBtn.count()) {
    await skipBtn.click();
    await page
      .waitForSelector(".onboarding-backdrop", {
        state: "detached",
        timeout: 15000,
      })
      .catch(() => {});
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    locale: "he-IL",
    permissions: ["microphone"],
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    const silence = () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.01;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      return dest.stream;
    };
    navigator.mediaDevices.getUserMedia = async () => silence();

    class FakeRecorder {
      constructor(stream, opts) {
        this.stream = stream;
        this.state = "inactive";
        this.ondataavailable = null;
        this.onstop = null;
        this.mimeType = opts?.mimeType || "audio/webm";
      }
      static isTypeSupported(type) {
        return typeof type === "string" && type.includes("webm");
      }
      start() {
        this.state = "recording";
        setTimeout(() => {
          if (this.state !== "recording") return;
          this.ondataavailable?.({
            data: new Blob([new Uint8Array(2048).fill(1)], {
              type: this.mimeType,
            }),
          });
        }, 40);
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([new Uint8Array(8192).fill(2)], {
            type: this.mimeType,
          }),
        });
        this.onstop?.();
      }
      pause() {}
      resume() {}
      requestData() {}
    }
    window.MediaRecorder = FakeRecorder;
  });

  // Real path uses POST /api/recordings (not /api/transcribe)
  await page.route("**/api/recordings**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const recordingId =
      route.request().headers()["x-recording-id"] || crypto.randomUUID();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recording: {
          id: recordingId,
          transcript: `אני צריכה לקנות ${UNIQUE}`,
          status: "ready",
        },
      }),
    });
  });

  let chatPosts = 0;
  const chatBodies = [];
  page.on("request", async (req) => {
    if (req.method() === "POST" && req.url().includes("/api/chat")) {
      chatPosts += 1;
      try {
        chatBodies.push(req.postData() || "");
      } catch {
        /* ignore */
      }
    }
  });

  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "qa-tester@example.com");
  await page.fill('input[type="password"]', "QaTestPass123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 30000 });
  await page.waitForSelector('textarea[aria-label="הודעה לסוכן"]', {
    timeout: 30000,
  });
  await dismissOnboarding(page);

  // Happy path
  const beforeHappy = chatPosts;
  await page.click('button[aria-label="הקלטת הודעה"]');
  await page.waitForSelector('button[aria-label="סיום הקלטה"]', {
    timeout: 15000,
  });
  await page.waitForTimeout(600);
  await page.click('button[aria-label="סיום הקלטה"]');

  try {
    await page.waitForFunction(
      (token) => (document.body?.innerText || "").includes(token),
      UNIQUE,
      { timeout: 120000 },
    );
    const sent = chatBodies.some((b) => b.includes(UNIQUE));
    record(
      "QA-11-happy",
      sent && chatPosts > beforeHappy ? "PASS" : "FAIL",
      `chatPosts=${chatPosts - beforeHappy} sentUnique=${sent}`,
    );
  } catch (error) {
    record(
      "QA-11-happy",
      "FAIL",
      `timeout waiting unique reply; chatPosts=${chatPosts - beforeHappy} err=${String(error).slice(0, 160)}`,
    );
  }

  // Return mic to idle if needed
  const discard = page.getByRole("button", { name: "מחיקת הקלטה" });
  if (await discard.count()) await discard.click().catch(() => {});
  const cancel = page.getByRole("button", { name: "ביטול הקלטה" });
  if (await cancel.count()) await cancel.click().catch(() => {});
  await page
    .waitForSelector('button[aria-label="הקלטת הודעה"]', { timeout: 30000 });

  // Failure path — reload composer state cleanly then force chat 500 once
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('textarea[aria-label="הודעה לסוכן"]', {
    timeout: 30000,
  });
  await dismissOnboarding(page);
  let failOnce = true;
  await page.route("**/api/chat**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced_fail" }),
      });
      return;
    }
    await route.continue();
  });

  const failToken = `${UNIQUE}-retry`;
  await page.unroute("**/api/recordings**");
  await page.route("**/api/recordings**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const recordingId =
      route.request().headers()["x-recording-id"] || crypto.randomUUID();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recording: {
          id: recordingId,
          transcript: failToken,
          status: "ready",
        },
      }),
    });
  });

  const postsBeforeFail = chatPosts;
  await page.click('button[aria-label="הקלטת הודעה"]');
  await page.waitForSelector('button[aria-label="סיום הקלטה"]', {
    timeout: 15000,
  });
  await page.waitForTimeout(600);
  await page.click('button[aria-label="סיום הקלטה"]');
  await page.waitForTimeout(4000);

  const draft = await page
    .locator('textarea[aria-label="הודעה לסוכן"]')
    .inputValue();
  const draftKept = draft.includes(failToken);
  const failPosts = chatPosts - postsBeforeFail; // should be 1 failed attempt

  const postsBeforeRetry = chatPosts;
  if (draftKept) {
    await page.click('button[aria-label="שליחה"]');
    await page.waitForTimeout(8000);
  }
  const retryPosts = chatPosts - postsBeforeRetry;
  const noDouble = retryPosts === 1;

  record(
    "QA-11-fail-retry",
    draftKept && failPosts >= 1 && noDouble ? "PASS" : "FAIL",
    `draftKept=${draftKept} failPosts=${failPosts} retryPosts=${retryPosts} draft=${JSON.stringify(draft).slice(0, 100)}`,
  );

  await browser.close();
  console.log("\n=== MIC QA SUMMARY ===");
  for (const r of results) console.log(`${r.id}\t${r.status}\t${r.detail}`);
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
