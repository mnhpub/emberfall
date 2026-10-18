// Robust browser suite: real Vite client, real local Worker on the proxied port, and the real DXF intake.
// Run through `make test-ui`. Uses node:test so it needs no runner beyond Node.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { issueSession } from "../../worker/session.ts";
import { initialState, transition } from "../../packages/game-core/index.ts";
import { localToWorld, FERRY } from "../../packages/vessels/index.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const WEB = "http://127.0.0.1:5195";
const WORKER = "http://127.0.0.1:8787";
// A relative venv path (from make) must resolve against the project, since services run from ROOT.
const rawPython = process.env.PYTHON;
const PYTHON = rawPython ? (rawPython.includes("/") ? resolve(ROOT, rawPython) : rawPython) : "python3";
const SECRET = crypto.randomUUID() + crypto.randomUUID();
const LAUNCH = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const STORAGE_KEY = "emberfall.maritime.v1";

const dir = await mkdtemp(join(tmpdir(), "emberfall-ui-"));
const children: ChildProcess[] = [];
let browser: Browser;
let logs = "";

function spawnGroup(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const keep = (chunk: Buffer) => { logs += String(chunk); };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
    }
  }
}

async function until(url: string, headers?: Record<string, string>, attempts = 160) {
  for (let n = 0; n < attempts; n++) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Service did not become ready: ${url}\n${logs.slice(-3000)}`);
}

// The intake answers 404 for unknown jobs; any HTTP response proves it is listening.
async function untilListening(url: string, attempts = 120) {
  for (let n = 0; n < attempts; n++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Service is not listening: ${url}\n${logs.slice(-3000)}`);
}

async function portFree(port: number) {
  try {
    await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) });
    throw new Error(`Port ${port} is already in use; stop that service before running make test-ui`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Port")) throw error;
  }
}

const token = await issueSession(SECRET, "player_001", "haven");

// Wrangler config for the authority Durable Objects only; secrets come from .dev.vars.
await writeFile(
  join(dir, "wrangler.toml"),
  `name = "emberfall-ui-e2e"
main = ${JSON.stringify(resolve(ROOT, "worker/index.ts"))}
compatibility_date = "2026-10-17"
compatibility_flags = ["nodejs_compat"]

[vars]
CLIENT_ORIGIN = "${WEB}"

[[durable_objects.bindings]]
name = "AUTHORITY_SESSIONS"
class_name = "AuthoritySession"

[[durable_objects.bindings]]
name = "SHARED_WORLDS"
class_name = "SharedWorld"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["AuthoritySession", "SharedWorld"]
`,
);
await writeFile(join(dir, ".dev.vars"), `AUTHORITY_SIGNING_KEY=${JSON.stringify(SECRET)}\n`, { mode: 0o600 });

before(async () => {
  await portFree(8787);
  await portFree(5195);
  await portFree(8790);
  spawnGroup("npx", [
    "wrangler", "dev", "--local", "--config", join(dir, "wrangler.toml"),
    "--ip", "127.0.0.1", "--port", "8787", "--inspector-port", "9242", "--persist-to", join(dir, "state"),
  ], { env: { WRANGLER_SEND_METRICS: "false" } });
  await until(`${WORKER}/api/authority/haven/snapshot`, { authorization: `Bearer ${token}` });
  spawnGroup("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5195", "--strictPort"]);
  await until(WEB);
  spawnGroup(PYTHON, ["pipelines/local_intake.py"], { env: { EMBERFALL_DEV_ORIGIN: WEB } });
  await untilListening("http://127.0.0.1:8790/asset-api/jobs/x");
  browser = await chromium.launch({ headless: true, args: LAUNCH });
});

after(async () => {
  await browser?.close();
  stopAll();
  await new Promise((r) => setTimeout(r, 300));
  await rm(dir, { recursive: true, force: true });
});

// Each test gets a fresh context so localStorage and cookies never leak between tests.
async function openPage(width = 1440, height = 960) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.goto(WEB);
  return { context, page, pageErrors, consoleErrors };
}

async function chooseShipwright(page: Page) {
  await page.getByRole("button", { name: /^Shipwright/ }).click();
}

async function openAuthorityPanel(page: Page) {
  await chooseShipwright(page);
  await page.getByText("Online expeditions · preview", { exact: true }).click();
}

test("client boots and accepts a profession with no page or console errors", async () => {
  const { context, page, pageErrors, consoleErrors } = await openPage();
  try {
    await chooseShipwright(page);
    await page.getByRole("button", { name: "I · Kit, equipment & crafting" }).waitFor();
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await context.close();
  }
});

test("chosen profession and inventory persist across a reload", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await chooseShipwright(page);
    await page.waitForFunction((key) => {
      const raw = localStorage.getItem(key);
      return raw !== null && JSON.parse(raw).profession === "shipwright";
    }, STORAGE_KEY);
    await page.reload();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    assert.equal(saved.profession, "shipwright");
    assert.equal(saved.inventory.wood, 0);
    await page.getByRole("button", { name: "I · Kit, equipment & crafting" }).waitFor();
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("workshop opens and closes through its accessible controls", async () => {
  const { context, page } = await openPage();
  try {
    await chooseShipwright(page);
    await page.getByRole("button", { name: "I · Kit, equipment & crafting" }).click();
    await page.getByRole("heading", { name: "Kit & workshop" }).waitFor();
    await page.getByRole("button", { name: "Close workshop" }).click();
    await page.getByRole("heading", { name: "Kit & workshop" }).waitFor({ state: "detached" });
  } finally {
    await context.close();
  }
});

test("valid DXF panel is converted and offered for local preview", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await chooseShipwright(page);
    await page.getByLabel("Upload a DXF panel").setInputFiles(join(ROOT, "fixtures/ship-panel.dxf"));
    await page.getByRole("button", { name: "Approve local preview at dock" }).waitFor();
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("corrupt DXF is rejected and never offered for preview", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await chooseShipwright(page);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/asset-api/upload")),
      page.getByLabel("Upload a DXF panel").setInputFiles({
        name: "corrupt.dxf",
        mimeType: "application/dxf",
        buffer: Buffer.from("this is not a drawing\n"),
      }),
    ]);
    assert.equal(response.status(), 422);
    const { error } = (await response.json()) as { error: string };
    assert.ok(error.trim().length > 0, "rejection must explain itself");
    // The client displays the intake's own error string; wait until that text is on screen.
    const firstLine = error.trim().split("\n").pop()!.slice(0, 24);
    await page.waitForFunction((text) => document.body.innerText.includes(text), firstLine);
    assert.equal(await page.getByText(/review ready/).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Approve local preview at dock" }).count(), 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("unreachable authority service shows an alert and the local game keeps working", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await page.route("**/api/authority/**", (route) => route.abort("connectionrefused"));
    await openAuthorityPanel(page);
    await page.getByLabel("Authority access token").fill(token);
    await page.getByRole("button", { name: "Connect to expedition", exact: true }).click();
    await page.getByRole("alert").first().waitFor();
    await page.unroute("**/api/authority/**");
    await page.getByRole("button", { name: "I · Kit, equipment & crafting" }).click();
    await page.getByRole("heading", { name: "Kit & workshop" }).waitFor();
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("rejected access token is refused and never written to browser storage", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    const bogus = "bogus-token-" + crypto.randomUUID();
    await openAuthorityPanel(page);
    await page.getByLabel("Authority access token").fill(bogus);
    await page.getByRole("button", { name: "Connect to expedition", exact: true }).click();
    await page.getByRole("alert").first().waitFor();
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    assert.equal(stored.includes(bogus), false);
    assert.equal(stored.includes(token), false);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("valid token connects to a private expedition", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await openAuthorityPanel(page);
    await page.getByLabel("Authority access token").fill(token);
    await page.getByRole("button", { name: "Connect to expedition", exact: true }).click();
    await page.getByText("PRIVATE ONLINE EXPEDITION · Authority connected", { exact: false }).waitFor();
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("phone-width layout has no horizontal page scroll", async () => {
  const { context, page, pageErrors } = await openPage(390, 844);
  try {
    await chooseShipwright(page);
    await page.getByRole("button", { name: "I · Kit, equipment & crafting" }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `page is ${overflow}px wider than the phone viewport`);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("isometric overview toggles on and back to perspective without errors", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await chooseShipwright(page);
    const isoButton = page.getByRole("button", { name: "Isometric map" });
    assert.equal(await isoButton.count(), 0, "isometric control is only offered in the vessel overview");
    await page.getByRole("button", { name: "Vessel overview" }).click();
    await isoButton.click();
    await page.getByRole("button", { name: "Perspective view" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Perspective view" }).getAttribute("aria-pressed"), "true");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Perspective view" }).click();
    await isoButton.waitFor();
    await page.getByRole("button", { name: "Follow player" }).click();
    assert.equal(await page.getByRole("button", { name: "Isometric map" }).count(), 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

// Count oscillator starts so the test proves sound is produced, not only that a button flips.
async function instrumentAudio(page: Page) {
  await page.addInitScript(() => {
    (window as any).__oscStarts = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args: any[]) {
      (window as any).__oscStarts++;
      return start.apply(this, args as any);
    };
  });
}

test("8-bit soundtrack waits for a gesture, plays, and mutes from the header", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await instrumentAudio(page);
  try {
    await page.goto(WEB);
    const toggle = page.getByRole("button", { name: "♪ Music on" });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    // Autoplay policy: nothing may sound before the player's first gesture.
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => (window as any).__oscStarts), 0);
    await page.getByRole("button", { name: /^Shipwright/ }).click();
    await page.waitForFunction(() => (window as any).__oscStarts > 0, undefined, { timeout: 5000 });
    // Mute from the header: the preference persists and the button reflects it.
    await page.getByRole("button", { name: "♪ Music on" }).click();
    await page.getByRole("button", { name: "♪ Music off" }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("emberfall.music.enabled")), "off");
    await page.reload();
    await page.getByRole("button", { name: "♪ Music off" }).waitFor();
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("failed boarding keeps its reason when the helm is pressed afterwards", async () => {
  const { context, page, pageErrors } = await openPage();
  try {
    await chooseShipwright(page);
    // Starting position is far from the gangway, so boarding must fail with a specific reason.
    await page.getByRole("button", { name: "Board Endurance ferry" }).click();
    await page.getByText(/Walk to the Endurance gangway to board/).waitFor();
    await page.getByRole("button", { name: /H · Take ferry helm/ }).click();
    await page.getByText(/You are not aboard Endurance yet/).waitFor();
    assert.equal(await page.getByText("Board the ferry first.").count(), 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

// Build a save aboard the ferry with the player at a chosen point on deck, using the core so the fixture follows its rules.
function aboardAt(local: { x: number; z: number }) {
  let state = transition(initialState(), { type: "choose-profession", profession: "fisher" });
  const dock = localToWorld(FERRY.boarding, state.ferry.pose);
  state = transition({ ...state, position: { x: dock.x, z: dock.z } }, { type: "ferry-board" });
  state.ferry.passenger = { local: { ...local }, station: "deck" };
  state.position = localToWorld(local, state.ferry.pose);
  return state;
}

async function openAboard(local: { x: number; z: number }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const fixture = aboardAt(local);
  await page.addInitScript((state) => {
    if (!sessionStorage.getItem("__aboardFixture")) {
      sessionStorage.setItem("__aboardFixture", "1");
      localStorage.setItem("emberfall.maritime.v1", JSON.stringify(state));
    }
  }, fixture);
  await page.goto(WEB);
  // The 3D scene only listens for keys once its controls are wired; wait for that signal, not a timer.
  await page.locator('canvas[data-controls-ready="true"]').waitFor();
  return { context, page, pageErrors };
}

test("the helm wheel is shown on deck and H takes the helm from beside it", async () => {
  const { context, page, pageErrors } = await openAboard({ x: 0, z: 34 });
  try {
    await page.locator(".helm-hint", { hasText: "At the helm wheel" }).waitFor();
    await page.getByRole("button", { name: /H · Take ferry helm/ }).click();
    await page.getByText(/At helm\. Set sails/).waitFor();
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test("holding S on deck walks the player toward the helm and the hint follows", async () => {
  const { context, page, pageErrors } = await openAboard({ x: -9, z: 0 });
  try {
    const metres = async () => Number(/Helm (\d+) m/.exec((await page.locator(".helm-hint").textContent()) ?? "")?.[1]);
    await page.locator(".helm-hint").waitFor();
    const start = await metres();
    assert.ok(Number.isFinite(start), "the hint reports a distance before walking");
    await page.bringToFront();
    await page.evaluate(() => document.body.focus());
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyS");
    await page.waitForFunction((from) => {
      const m = /Helm (\d+) m/.exec(document.querySelector(".helm-hint")?.textContent ?? "");
      return m !== null && Number(m[1]) < from - 2;
    }, start, { timeout: 15000 });
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
