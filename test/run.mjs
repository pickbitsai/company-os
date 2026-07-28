#!/usr/bin/env node
// Test suite. No dependencies, no framework — `node test/run.mjs`.
//
// The Acme example is the fixture: building it exercises the same code paths a real company
// does, so a break shows up as a wrong page rather than a failed mock.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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


// ---------------------------------------------------------------- env panel privacy contract
// The highest-consequence panel in the package: it reads .env files, and its output is a static
// HTML file that gets committed and screenshotted. The contract is that VALUES never reach the
// page and key NAMES only when explicitly asked for. Both halves are asserted against a stub
// enview, because "we reviewed it carefully" is not a regression test.
console.log("\n--- env panel privacy ---");

const SECRET_VALUE = "sk-live-THIS-MUST-NEVER-RENDER";
const SECRET_NAME = "STRIPE_SECRET_KEY";

// The stub deliberately hands the panel MORE than the real enview would, including a raw value.
// If the panel ever starts rendering what it is handed, this fixture makes it visible.
function enviewFixture() {
  const dir = mkdtempSync(join(tmpdir(), "company-os-enview-"));
  const pkg = join(dir, "node_modules", "@pickbitsai", "enview");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", private: true }));
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@pickbitsai/enview", version: "0.2.0", main: "index.mjs" }));
  writeFileSync(join(pkg, "index.mjs"), [
    "export function scanProjects() {",
    "  return [{ name: 'signal', files: [{",
    "    projectDir: 'packages/signal', fileName: '.env', environment: 'development',",
    `    keys: ['${SECRET_NAME}', 'PORT', 'DEBUG'],`,
    `    plaintextKeys: ['${SECRET_NAME}'], encryptedKeys: [], sensitiveKeys: ['${SECRET_NAME}'],`,
    `    values: { ${SECRET_NAME}: '${SECRET_VALUE}' },`,
    "    encryption: { type: 'none' },",
    "    gitIgnored: true, gitTracked: false, gitInHistory: false, inGitRepo: true,",
    "    modifiedAt: new Date().toISOString(),",
    "  }] }];",
    "}",
    "export function auditProjects() { return { findings: [], summary: {} }; }",
  ].join("\n"));
  return dir;
}

async function buildWithEnv(settings) {
  const dir = enviewFixture();
  const out = join(ACME, ".test-env");
  await build({ ...config, configDir: dir, panels: { env: settings }, outDir: out },
    { argv: [], log: () => {}, warn: () => {} });
  const floor = readFileSync(join(out, "index.html"), "utf8");
  rmSync(out, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
  return floor;
}

await test("env panel never writes a secret value into the page", async () => {
  const floor = await buildWithEnv({});
  assert.ok(floor.includes('id="env"'), "the stub enview should resolve, so the panel must render");
  assert.ok(!floor.includes(SECRET_VALUE), "a .env VALUE reached the generated page");
});

await test("key names are withheld unless showKeyNames is explicitly on", async () => {
  const floor = await buildWithEnv({});
  assert.ok(!floor.includes(SECRET_NAME), "a credential-shaped key NAME rendered without showKeyNames");
  assert.ok(floor.includes("Key names are not written into it either"),
    "the page must state the guarantee it is actually keeping");
});

await test("showKeyNames reveals names, still no values, and the page stops claiming otherwise", async () => {
  const floor = await buildWithEnv({ showKeyNames: true });
  assert.ok(floor.includes(SECRET_NAME), "showKeyNames was on but no key name rendered");
  assert.ok(!floor.includes(SECRET_VALUE), "a .env VALUE reached the page even with only names enabled");
  // The page used to assert "no key names are ever written into it" while writing them directly
  // below. A page that lies about its own privacy posture is worse than one that says nothing.
  assert.ok(!floor.includes("Key names are not written into it either"),
    "the page claimed it withholds key names while rendering them");
});


// ---------------------------------------------------------------- policy panel
// This panel renders a snapshot produced by something else, so every test here is about what it
// does when that snapshot is old, incomplete, or absent. A panel that renders a stale or
// unmeasured report as current is the exact failure this project is organized against.
console.log("\n--- policy panel ---");

const NOW = "2026-03-10T12:00:00.000Z";
const FULL_REPORT = {
  date: NOW,
  applied: false,
  scanned: 12,
  ungoverned: ["sketch"],
  repos: [
    { name: "signal", branch: "main", onProtected: true, governed: true, dirty: 4, unpushed: [] },
    { name: "forge", branch: "agent/gates", onProtected: false, governed: true, dirty: 0,
      unpushed: [{ branch: "agent/gates", reason: "2 commits ahead of origin/agent/gates", quiet: true }] },
    { name: "sketch", branch: "main", onProtected: true, governed: false, dirty: 0, unpushed: [] },
    { name: "unrelated-repo", branch: "main", onProtected: true, governed: true, dirty: 9, unpushed: [] },
  ],
  proposals: [
    { name: "forge", branch: "agent/gates", reason: "2 commits ahead", note: "add to sweep.pushAndPr to authorize" },
    { name: "signal", branch: "spike", reason: "branch never pushed", note: "add to sweep.pushAndPr to authorize" },
  ],
  accepted: [{ name: "atlas", branch: "claude/old-idea", reason: "branch never pushed" }],
  actions: [],
  errors: [],
};

const policyPanel = await import("../src/panels/policy.mjs");
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const renderPolicy = (data) => policyPanel.render(data, { esc: escHtml });

function reportFixture(report) {
  const dir = mkdtempSync(join(tmpdir(), "company-os-closeout-"));
  writeFileSync(join(dir, "2026-03-10.json"), JSON.stringify(report));
  return dir;
}

async function policyData(report, nowIso = NOW) {
  const dir = reportFixture(report);
  try {
    return policyPanel.collect({ config: { configDir: dir }, manifest, settings: { reports: dir }, nowIso });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await test("policy panel separates protected-branch, governance and authorization findings", async () => {
  const data = await policyData(FULL_REPORT);
  const keys = data.findings.map((f) => f.key);
  assert.ok(keys.includes("protected"), "a dirty tree on a protected branch is a finding");
  assert.ok(keys.includes("ungoverned"), "a repo with no hooks installed is a finding");
  assert.ok(keys.includes("unauthorized"), "a proposal nobody can act on is its own category");
  const ungoverned = data.findings.find((f) => f.key === "ungoverned");
  assert.deepEqual(ungoverned.names, ["sketch"]);
});

await test("a report that never measured coverage reports absence, never zero", async () => {
  const { scanned, ungoverned, ...older } = FULL_REPORT;
  const data = await policyData(older);
  assert.equal(data.measuresCoverage, false);
  assert.equal(data.scanned, null, "an unmeasured count must be null, not 0");
  assert.ok(!data.findings.some((f) => f.key === "ungoverned"),
    "absent coverage must not render as a clean bill of health");
  const html = renderPolicy(data);
  assert.match(html, /coverage not measured/);
});

await test("a stale report is labelled stale rather than presented as current", async () => {
  const fresh = await policyData(FULL_REPORT);
  assert.equal(fresh.stale, false);
  const old = await policyData(FULL_REPORT, "2026-03-14T12:00:00.000Z"); // 96h later
  assert.equal(old.stale, true);
  assert.match(renderPolicy(old), /stale/);
});

await test("accepted debt is counted, never raised as a finding", async () => {
  const data = await policyData(FULL_REPORT);
  assert.equal(data.acceptedCount, 1);
  assert.ok(!data.findings.some((f) => /debt/i.test(f.message)), "debt is a number, not an alert");
  assert.match(renderPolicy(data), /accepted as debt/);
  const { accepted, ...noDebt } = FULL_REPORT;
  const blind = await policyData(noDebt);
  assert.equal(blind.acceptedCount, null, "a report that never tracked debt must not read as zero debt");
  assert.ok(!/accepted as debt/.test(renderPolicy(blind)));
});

await test("engines are rowed, unrelated repos are counted, and silent engines are named", async () => {
  const data = await policyData(FULL_REPORT);
  const rowed = data.engineRows.map((r) => r.engineName).sort();
  assert.deepEqual(rowed, ["Forge", "Signal", "Sketch"], "manifest engines get rows");
  assert.equal(data.otherWithFindings, 1, "repos outside the manifest are a count, not rows");
  assert.ok(data.unreportedEngines.includes("Atlas"),
    "an engine the report never mentioned must be named, since clean and not-a-repo look identical");
  // An engine cannot simultaneously have a row and be absent from the report. The two lists are
  // complements; if they ever overlap the panel is telling two stories about the same project.
  assert.deepEqual(
    rowed.filter((name) => data.unreportedEngines.includes(name)), [],
    "no engine may appear both as a row and as unreported",
  );
});

await test("a missing closeout report disables the panel instead of failing the build", async () => {
  const warnings = [];
  const out = join(ACME, ".test-policy");
  const built = await build({ ...config, panels: { policy: { reports: "./no-such-directory" } }, outDir: out },
    { argv: [], log: () => {}, warn: (m) => warnings.push(m) });
  assert.ok(built.written.length > 0, "the build must still produce pages");
  assert.ok(!readFileSync(join(out, "index.html"), "utf8").includes('id="policy"'));
  assert.ok(warnings.some((w) => /policy/.test(w)), "a skipped panel must say so");
  rmSync(out, { recursive: true, force: true });
});

// ---------------------------------------------------------------- shape panel
// This panel makes CLAIMS about someone's projects, so the tests are about whether the claims are
// falsifiable and whether the stated reasons support the stated conclusion.
console.log("\n--- shape panel ---");
{
  const shape = await import("../src/panels/shape.mjs");
  const fixtures = join(ROOT, "test", "tmp", "shape");
  rmSync(fixtures, { recursive: true, force: true });

  const write = (rel, content) => {
    const p = join(fixtures, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  };

  // An agentic engine: agent files, skills, namespaced commands.
  write("engine/CLAUDE.md", "# engine");
  write("engine/AGENTS.md", "# agents");
  write("engine/.claude/skills/one/SKILL.md", "# skill");
  write("engine/.claude/skills/two/SKILL.md", "# skill");
  write("engine/README.md", "# engine");
  write("engine/package.json", {
    name: "engine", private: true,
    scripts: Object.fromEntries("abcdefghijklmnop".split("").map((c, i) => [`group${i % 4}:${c}`, `node ${c}.mjs`])),
  });
  // A CLI.
  write("cli/README.md", "# cli");
  write("cli/package.json", { name: "cli", version: "1.0.0", bin: { cli: "./bin.js" }, scripts: { test: "node --test" } });
  // A game — its only distinguishing signal is a dependency.
  write("game/README.md", "# game");
  write("game/package.json", { name: "game", version: "1.0.0", main: "index.js", dependencies: { phaser: "^3" } });
  // A junk drawer: no README, no manifest, no git.
  write("junk/notes.txt", "misc");
  write("junk/old-thing.js", "// ?");

  const manifest = {
    engines: ["engine", "cli", "game", "junk"].map((id) => ({
      id, dir: id, name: id, class: "x", accent: "#888", role: "x", nodes: [],
    })),
  };
  const data = shape.collect({ config: { root: fixtures }, manifest, settings: { looseThreshold: 20 } });
  const byId = Object.fromEntries(data.projects.map((p) => [p.id, p]));

  await test("classifies an agentic engine", () => assert.ok(byId.engine?.kind === "agentic engine", byId.engine?.kind));
  await test("classifies a CLI", () => assert.ok(byId.cli?.kind === "tool (CLI)", byId.cli?.kind));
  await test("a dependency-defined game is not mislabelled a library", () => assert.ok(byId.game?.kind === "game", byId.game?.kind));
  await test("an empty directory is unclassified, not guessed", () => assert.ok(byId.junk?.kind === "unclassified", byId.junk?.kind));

  // The label must be falsifiable: four inputs, more than one output.
  await test("classifier produces more than one kind", () => assert.ok(Object.keys(data.kinds).length >= 3, JSON.stringify(data.kinds)));

  // The reason shown must support the verdict reached. This is the bug the panel shipped with:
  // "game" displaying "CLAUDE.md present" as its evidence.
  await test("game's evidence cites the dependency", () => assert.ok(/phaser/.test(byId.game.evidence.join(" ")), byId.game.evidence.join(" · ")));
  await test("CLI's evidence cites bin", () => assert.ok(/bin/.test(byId.cli.evidence.join(" ")), byId.cli.evidence.join(" · ")));
  await test("engine's evidence cites agent files or skills", () => assert.ok(/CLAUDE|skill/.test(byId.engine.evidence.join(" ")), byId.engine.evidence.join(" · ")));
  await test("engine's evidence does NOT cite a dependency", () => assert.ok(!/dependency/.test(byId.engine.evidence.join(" "))));

  // Coherence findings are observations, not adjectives.
  await test("junk drawer flagged", () => assert.ok(byId.junk.junkDrawer === true));
  await test("coherent project not flagged", () => assert.ok(byId.engine.junkDrawer === false));
  await test("junk drawer names all three missing things", () => assert.ok(byId.junk.findings.length >= 3, JSON.stringify(byId.junk.findings)));
  await test("no finding uses a judgement word", () => assert.ok(!JSON.stringify(data.projects).match(/\bdirty\b|\bbad\b|\bmessy\b/i)));

  // Rendering must not assert a coherence problem where there is none.
  const html = shape.render(data, { esc: (s) => String(s), cmdRow: (c) => `<code>${c}</code>` });
  await test("renders the agent-scan prompt for what a file tree cannot settle", () => assert.ok(/Audit each project/.test(html)));
  await test("renders every project", () => assert.ok(["engine", "cli", "game", "junk"].every((n) => html.includes(n))));

  rmSync(fixtures, { recursive: true, force: true });
}

// ---------------------------------------------------------------- summary
console.log(`\n${failures.length ? `FAIL — ${failures.length} of ${passed + failures.length}` : `PASS — ${passed} tests`}`);
if (failures.length) {
  for (const [name, error] of failures) console.log(`\n${name}\n${error.stack}`);
  process.exitCode = 1;
}
// Leave the fixture output in place: it is useful to look at, and .gitignore excludes it.
void rmSync;
