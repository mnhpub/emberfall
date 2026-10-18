import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { initialState, transition } from "../packages/game-core/index.ts";
const web = spawn(
  "npm",
  ["run", "dev", "--", "--port", "5189", "--strictPort"],
  { stdio: "pipe", detached: process.platform !== "win32" },
);
const intake = spawn(
  process.env.PYTHON ?? "python3",
  ["pipelines/local_intake.py"],
  {
    stdio: "pipe",
    detached: process.platform !== "win32",
    env: { ...process.env, EMBERFALL_DEV_ORIGIN: "http://127.0.0.1:5189" },
  },
);
let browser;
const errors: string[] = [];
try {
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch("http://127.0.0.1:5189")).ok) break;
    } catch {}
    if (n === 79) throw new Error("Vite did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Page error:", e.message);
  });
  await page.goto("http://127.0.0.1:5189");
  await page.getByRole("button", { name: /^Shipwright/ }).click();
  await page
    .getByRole("button", { name: "I · Kit, equipment & crafting" })
    .click();
  await page.getByRole("heading", { name: "Kit & workshop" }).waitFor();
  await page.getByRole("button", { name: "Close workshop" }).click();
  // Deterministic station fixture. Core tests separately verify these transitions.
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "shipwright",
  });
  const go = (x: number, z: number) => {
    for (
      let n = 0;
      n < 2000 && Math.hypot(s.position.x - x, s.position.z - z) > 0.3;
      n++
    )
      s = transition(s, {
        type: "move",
        dx: x - s.position.x,
        dz: z - s.position.z,
        dt: 0.05,
      });
  };
  for (let n = 0; n < 6; n++)
    s = transition(s, { type: "collect", id: "yard-bolts" });
  go(-15, 11);
  for (let n = 0; n < 4; n++)
    s = transition(s, { type: "collect", id: "canvas-bundle" });
  go(-15, 5);
  for (let n = 0; n < 7; n++)
    s = transition(s, { type: "collect", id: "metal-offcuts" });
  go(-13, 7);
  for (let n = 0; n < 8; n++)
    s = transition(s, { type: "gather", id: "quarry" });
  go(-9, 10);
  for (let n = 0; n < 20; n++)
    s = transition(s, { type: "gather", id: "timber" });
  go(-18, 10);
  s = transition(s, { type: "craft", recipe: "workbench" });
  s = transition(s, {
    type: "place",
    instanceId: s.items.at(-1)!.id,
    x: -20,
    z: 10,
  });
  await page.addInitScript((state) => {
    if (!sessionStorage.getItem("__fixtureLoaded")) {
      localStorage.setItem("emberfall.maritime.v1", JSON.stringify(state));
      sessionStorage.setItem("__fixtureLoaded", "1");
    }
  }, s);
  await page.reload();
  await page
    .getByRole("button", { name: "I · Kit, equipment & crafting" })
    .click();
  for (const name of ["Canvas work clothes", "Canvas backpack"]) {
    await page
      .locator(".recipe-grid article")
      .filter({ hasText: name })
      .getByRole("button", { name: "Craft", exact: true })
      .click();
    await page
      .locator(".item-list article")
      .filter({ hasText: name })
      .getByRole("button", { name: "Equip", exact: true })
      .click();
  }
  await mkdir("build", { recursive: true });
  await page.screenshot({ path: "build/workshop.png" });
  await page.getByRole("button", { name: "Close workshop" }).click();
  await page
    .getByLabel("Upload a DXF panel")
    .setInputFiles("fixtures/ship-panel.dxf");
  await page
    .getByRole("button", { name: "Approve local preview at dock" })
    .click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "build/world-objects.png" });
  await page.waitForTimeout(3200);
  await page.reload();
  await page
    .getByRole("button", { name: "I · Kit, equipment & crafting" })
    .click();
  for (const name of ["Canvas backpack", "Canvas work clothes"])
    await page
      .locator(".equipment-slots")
      .getByText(name, { exact: true })
      .waitFor();
  // Home-dock fixture isolates browser handling; core tests sail both routes.
  const cargoState = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  cargoState.inventory.wood = 8;
  await page.addInitScript((state) => {
    if (!sessionStorage.getItem("__cargoFixtureLoaded")) {
      localStorage.setItem("emberfall.maritime.v1", JSON.stringify(state));
      sessionStorage.setItem("__cargoFixtureLoaded", "1");
    }
  }, cargoState);
  await page.reload();
  await page.getByRole("button", { name: "L · Dock ledger & cargo" }).click();
  await page.getByLabel("Cargo quantity").fill("6");
  await page.getByRole("button", { name: "Deposit carried supplies" }).click();
  await page
    .locator('[data-lot-id="lot-1"]')
    .getByRole("button", { name: "Assign 6 to aurum-timber" })
    .click();
  await page
    .locator('[data-lot-id="lot-1"]')
    .getByRole("button", { name: "Transfer 6", exact: true })
    .click();
  await page
    .locator('[data-lot-id="lot-1"]')
    .getByText(/Custody ship/)
    .waitFor();
  // A failed device write must roll back both cargo and carried inventory.
  await page.evaluate(() => {
    (window as any).__storageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new Error("Simulated quota failure");
    };
  });
  await page.getByLabel("Cargo quantity").fill("1");
  await page.getByRole("button", { name: "Deposit carried supplies" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Cargo not committed" })
    .waitFor();
  await page.evaluate(() => {
    Storage.prototype.setItem = (window as any).__storageSet;
  });
  await page.reload();
  await page.getByRole("button", { name: "L · Dock ledger & cargo" }).click();
  await page
    .locator('[data-lot-id="lot-1"]')
    .getByText(/Custody ship/)
    .waitFor();
  if ((await page.locator(".cargo-lot").count()) !== 1)
    throw new Error("Failed cargo commit leaked a lot");
  await page.screenshot({ path: "build/dock-ledger.png" });
  await page.getByRole("button", { name: "Close dock ledger" }).click();
  await page
    .getByRole("button", { name: "Shuttle: Haven ↔ ferry pier" })
    .click();
  await page
    .getByRole("button", { name: "Board Endurance ferry", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Aboard Endurance", exact: true })
    .waitFor();
  await page.locator('canvas[data-controls-ready="true"]').waitFor();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(3200);
  const savedFerry = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("emberfall.maritime.v1")!),
  );
  if (savedFerry.mode !== "ferry" || savedFerry.ferry.passenger.local.x <= -9)
    throw new Error("Deck walking did not update attachment");
  await page
    .getByRole("button", { name: "Vessel overview", exact: true })
    .click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: "build/ferry-overview.png" });
  let aboard = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  aboard = transition(aboard, { type: "ferry-shuttle" });
  aboard = transition(aboard, { type: "ferry-board" });
  const walkTo = (x: number, z: number) => {
    for (
      let n = 0;
      n < 1500 &&
      Math.hypot(
        aboard.ferry.passenger!.local.x - x,
        aboard.ferry.passenger!.local.z - z,
      ) > 0.25;
      n++
    )
      aboard = transition(aboard, {
        type: "move",
        dx: x - aboard.ferry.passenger!.local.x,
        dz: z - aboard.ferry.passenger!.local.z,
        dt: 0.05,
      });
  };
  walkTo(3, 0);
  walkTo(3, 35);
  walkTo(0, 35);
  aboard = transition(aboard, { type: "ferry-helm" });
  await page.addInitScript((state) => {
    if (!sessionStorage.getItem("__ferryHelmFixture")) {
      localStorage.setItem("emberfall.maritime.v1", JSON.stringify(state));
      sessionStorage.setItem("__ferryHelmFixture", "1");
    }
  }, aboard);
  await page.reload();
  await page.getByRole("button", { name: "Set / furl ferry sails" }).click();
  await page.locator('canvas[data-controls-ready="true"]').waitFor();
  await page.keyboard.down("KeyW");
  await page
    .waitForFunction(
      () => {
        const raw = localStorage.getItem("emberfall.maritime.v1");
        return raw && JSON.parse(raw).ferry.speed >= 2;
      },
      null,
      { timeout: 30000 },
    )
    .catch(async (error) => {
      console.error(
        "Ferry controls:",
        await page.locator(".ferry-controls").innerText(),
      );
      console.error(
        "Saved ferry:",
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("emberfall.maritime.v1")!).ferry,
        ),
      );
      throw error;
    });
  await page.keyboard.up("KeyW");
  await page.getByRole("button", { name: "H · Release ferry helm" }).click();
  await page.waitForTimeout(3200);
  await page.reload();
  const moving = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("emberfall.maritime.v1")!),
  );
  if (
    moving.mode !== "ferry" ||
    moving.ferry.passenger.station !== "deck" ||
    moving.ferry.speed <= 0 ||
    moving.ferry.pose.z >= 180
  )
    throw new Error(
      "Ferry helm/coasting persistence failed: " +
        JSON.stringify({ mode: moving.mode, ferry: moving.ferry }),
    );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "build/ferry-deck.png" });
  await page
    .getByRole("button", { name: "Vessel overview", exact: true })
    .click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: "build/ferry-sailing.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser smoke passed: profession, crafting/equipping, DXF preview, cargo handling/quota rollback, ferry walking/helm/coasting/reload; no page errors.",
  );
} finally {
  await browser?.close();
  for (const child of [web, intake]) {
    if (child.pid) {
      try {
        process.kill(
          process.platform === "win32" ? child.pid : -child.pid,
          "SIGTERM",
        );
      } catch {}
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.stdin?.destroy();
    child.unref();
  }
}
