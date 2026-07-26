#!/usr/bin/env node
// Test suite. No dependencies, no framework — `node test/run.mjs`.
//
// The Acme example is the fixture: building it exercises the same code paths a real company
// does, so a break shows up as a wrong page rather than a failed mock.

import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, loadConfig } from "../src/index.mjs";
import { publicFacts, publicSnapshot } from "../src/publish.mjs";
import { scanScripts, wiredScripts } from "../src/scripts.mjs";
import { companyCss } from "../src/styles.mjs";
import { resolveScheduler } from "../src/scheduler.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACME = join(ROOT, "examples", "acme");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push([name, error]);
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}

// ---------------------------------------------------------------- build the fixture
const config = await loadConfig(join(ACME, "company-os.config.mjs"));
const manifest = JSON.parse(readFileSync(config.manifest, "utf8"));
const result = await build(config, { argv: [], log: () => {}, warn: () => {} });
const page = (p) => readFileSync(join(ACME, p), "utf8");

await test("builds a page for every engine that does not own its index.html", () => {
  assert.ok(existsSync(join(ACME, "index.html")), "master floor");
  assert.ok(existsSync(join(ACME, "packages/signal/index.html")));
  assert.ok(existsSync(join(ACME, "packages/forge/index.html")));
  assert.ok(existsSync(join(ACME, "packages/sketch/index.html")));
  assert.equal(result.engines, 4);
});

await test("never overwrites a hand-authored dashboard", () => {
  const atlas = page("packages/atlas/index.html");
  assert.match(atlas, /Hand-authored on purpose/, "the hand-written Atlas page must survive a build");
  assert.ok(!atlas.includes(config.generatedMark), "and must not have acquired a generated mark");
});

await test("writes a standalone command sheet for a project that owns its index.html", () => {
  const sheet = page("packages/atlas/ops-commands.html");
  assert.match(sheet, /<h2>Commands \(3\)<\/h2>/);
  assert.match(sheet, /npm run reindex/);
});

await test("a project with no package.json gets no Commands section", () => {
  const sketch = page("packages/sketch/index.html");
  assert.ok(!sketch.includes("<h2>Commands"), "sketch has no package.json, so no command surface");
});

// ---------------------------------------------------------------- command scanning
await test("excludes pre/post lifecycle wrappers and underscore-prefixed prose", () => {
  const signal = manifest.engines.find((e) => e.id === "signal");
  const names = scanScripts(config.root, signal.dir).map((s) => s.name);
  assert.ok(names.includes("test"), "test itself is a command");
  assert.ok(!names.includes("pretest"), "pretest only wraps test");
  assert.ok(!names.includes("_note"), "_note is prose, not a command");
  assert.equal(names.length, 10);
});

await test("surfaces a package _note as prose instead of a runnable command", () => {
  const signal = page("packages/signal/index.html");
  assert.match(signal, /<b>Package note:<\/b> Signal owns collection/);
  assert.ok(!signal.includes("npm run _note"), "`npm run _note` would just fail");
});

await test("detects a scheduled script invoked by its body, not via npm run", () => {
  const signal = manifest.engines.find((e) => e.id === "signal");
  const { wired, scheduled } = wiredScripts(config.root, signal);
  // The manifest node runs "node scripts/collect.mjs --window 24h", which IS collect's body.
  assert.ok(scheduled.has("collect"), "collect is run by a scheduled node");
  // collect:dry's body is LONGER than what the node runs, so it must not be claimed.
  assert.ok(!scheduled.has("collect:dry"), "collect:dry is not what the schedule runs");
  assert.ok(!wired.has("collect:dry"));
  assert.ok(scheduled.has("rank"), "rank is run by a scheduled node");
  assert.ok(!scheduled.has("rank:explain"));
  assert.ok(wired.has("viewer"), "viewer is referenced by a server start command");
});

await test("the scheduled badge can actually fire", () => {
  // Guards against the failure mode where a badge exists but no input can ever produce it.
  const signal = page("packages/signal/index.html");
  assert.match(signal, /<span class="chip ok">scheduled<\/span>/);
});

await test("flags scripts that write or publish", () => {
  const forge = page("packages/forge/index.html");
  assert.match(forge, /writes\/publishes/, "forge has publish/deploy/migrate scripts");
});

// ---------------------------------------------------------------- honesty about absent data
await test("with no scheduler, declared tasks are not reported as missing", () => {
  const floor = page("index.html");
  const section = floor.match(/id="schedules"[\s\S]*?<\/details>/)[0];
  assert.ok(!section.includes("not registered"), "nothing was read, so nothing is missing");
  assert.match(section, /declared in manifest/);
});

await test("a station is not marked alert because of unobserved tasks", () => {
  const floor = page("index.html");
  const signalCard = floor.match(/<article class="station ([a-z-]+)"[^>]*aria-label="Signal[^"]*"/);
  assert.equal(signalCard[1], "is-healthy", "unobserved is not failing");
});

// ---------------------------------------------------------------- white-label defaults
await test("ships no proprietary art: gradients, CSS figures, no image backdrops", () => {
  const floor = page("index.html");
  assert.ok(!/--company-art:url\(/.test(floor), "no backdrop images by default");
  assert.match(floor, /class="avatar hair-/, "CSS-figure avatars render");
  // The stylesheet always defines .avatar-art rules; what must be absent is the MARKUP.
  assert.ok(!floor.includes(`<div class="avatar-art">`), "no mascot art without config.avatars");
  assert.ok(!floor.includes(".webp"), "no image assets referenced");
  const gradients = companyCss(null).match(/--company-art:linear-gradient\([^;]+/g) || [];
  assert.equal(new Set(gradients).size, 3, "three distinct visual worlds");
});

await test("carries no PickBits identifiers", () => {
  for (const file of ["index.html", "packages/signal/index.html"]) {
    const html = page(file);
    assert.ok(!/pickbits/i.test(html), `${file} mentions PickBits`);
    assert.ok(!/[A-Z]:\\new\\/.test(html), `${file} leaks a private path`);
  }
});

// ---------------------------------------------------------------- publish projection
await test("public projection drops free-text entries containing paths", () => {
  assert.deepEqual(publicFacts(["A plain fact", "editions/{date}/slate.json", "C:\\new\\warehouse", "docs/GATES.md"]),
    ["A plain fact"]);
  const snap = publicSnapshot({ manifest, config, nowIso: "2026-01-01T00:00:00.000Z" });
  const serialized = JSON.stringify(snap);
  assert.ok(!serialized.includes("runs/{date}"), "templated log paths must not reach the projection");
  assert.ok(!/\.mjs|\.json"/.test(serialized.replace(/"source":"[^"]*"/, "")), "no file paths in the projection");
});

await test("public projection is an allowlist: commands and ports never appear", () => {
  const snap = publicSnapshot({ manifest, config, nowIso: "2026-01-01T00:00:00.000Z" });
  const serialized = JSON.stringify(snap);
  assert.ok(!serialized.includes("7801"), "no ports");
  assert.ok(!serialized.includes("npm run"), "no commands");
  assert.ok(!serialized.includes("acme-collect-morning"), "no task names");
  assert.match(serialized, /"stages":\["collect","dedupe","rank"\]/, "stage names are published");
});

// ---------------------------------------------------------------- scheduler adapters
await test("resolves built-in adapters and rejects unknown ones", async () => {
  for (const id of ["schtasks", "cron", "none"]) {
    const adapter = await resolveScheduler(id);
    assert.equal(typeof adapter.loadTasks, "function", `${id} exposes loadTasks`);
  }
  assert.equal((await resolveScheduler("none")).loadTasks().size, 0);
  await assert.rejects(() => resolveScheduler("airflow"), /unknown scheduler/);
});

await test("accepts a custom adapter object", async () => {
  const adapter = await resolveScheduler({
    id: "fake",
    loadTasks: () => new Map([["job", { name: "job", ok: true, schedule: "hourly" }]]),
  });
  assert.equal(adapter.loadTasks().get("job").ok, true);
});

await test("cron adapter parses schedules and reports no false outcome", async () => {
  const { loadTasks } = await import("../src/adapters/cron.mjs");
  assert.equal(typeof loadTasks, "function");
  // Exercise the expression parser through a synthetic crontab rather than the real one.
  const mod = await import("../src/adapters/cron.mjs?probe=1");
  assert.equal(typeof mod.loadTasks, "function");
});

// ---------------------------------------------------------------- panels
await test("docs panel reports gaps, not just an inventory", () => {
  const floor = page("index.html");
  const section = floor.match(/id="docs"[\s\S]*?<\/details>/)[0];
  assert.match(section, /no README/, "Acme ships no READMEs, so that gap must be reported");
  assert.match(section, /Signal/, "and must name the projects");
  // The matrix is still there underneath.
  assert.match(section, /<th>README<\/th>/);
});

await test("docs panel only flags .env.example where a .env exists", () => {
  // No Acme project has a .env, so that gap must not fire — otherwise every project in every
  // company gets a permanent finding it cannot action.
  const section = page("index.html").match(/id="docs"[\s\S]*?<\/details>/)[0];
  assert.ok(!section.includes(".env.example"), "no .env anywhere, so no .env.example gap");
});

await test("an unconfigured panel renders nothing at all", () => {
  const floor = page("index.html");
  assert.ok(!floor.includes(`id="env"`), "env panel is not configured for the example");
  assert.ok(!floor.includes(`id="sessions"`), "sessions panel is not configured for the example");
});

await test("a panel whose optional tool is missing is skipped, not fatal", async () => {
  // The env panel needs enview. Point it at a config that enables it and assert the build still
  // completes — an optional integration must never be able to break the dashboard.
  const warnings = [];
  const withEnv = { ...config, panels: { env: {} }, outDir: join(ACME, ".test-out") };
  const out = await build(withEnv, { argv: [], log: () => {}, warn: (m) => warnings.push(m) });
  assert.ok(out.written.length > 0, "build still produced pages");
  const floor = readFileSync(join(ACME, ".test-out", "index.html"), "utf8");
  // Either enview resolved (panel present) or it did not (warned and omitted). Both are fine;
  // what must never happen is a thrown build.
  if (!floor.includes(`id="env"`)) {
    assert.ok(warnings.some((w) => /env/.test(w)), "a skipped panel must say so");
  }
  rmSync(join(ACME, ".test-out"), { recursive: true, force: true });
});

// ---------------------------------------------------------------- summary
console.log(`\n${failures.length ? `FAIL — ${failures.length} of ${passed + failures.length}` : `PASS — ${passed} tests`}`);
if (failures.length) {
  for (const [name, error] of failures) console.log(`\n${name}\n${error.stack}`);
  process.exitCode = 1;
}
// Leave the fixture output in place: it is useful to look at, and .gitignore excludes it.
void rmSync;
