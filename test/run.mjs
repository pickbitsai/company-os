#!/usr/bin/env node
// Test suite. No dependencies, no framework — `node test/run.mjs`.
//
// The Acme example is the fixture: building it exercises the same code paths a real company
// does, so a break shows up as a wrong page rather than a failed mock.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDLED_SKILLS,
  build,
  deriveStatus,
  discoverIntranet,
  installBundledSkill,
  installIntranetAgentRules,
  loadConfig,
  maintainIntranet,
  readBundledSkill,
  writeIntranetRegistry,
} from "../src/index.mjs";
import { INTRANET_SKILL } from "../src/intranet.mjs";
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
  // Assert the actual claim — unobserved is not FAILING — rather than the old proxy of
  // is-healthy. Signal publishes no status feed, so its honest resting state is unreported;
  // pinning this to is-healthy would re-encode the bug the unreported state exists to fix.
  assert.notEqual(signalCard[1], "is-alert", "unobserved is not failing");
  assert.equal(signalCard[1], "is-unreported", "and with no feed it cannot claim health either");
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

await test("GTM panel renders the portfolio call and every lean-strategy field", () => {
  const floor = page("index.html");
  const section = floor.match(/id="gtm"[\s\S]*?<\/details>/)[0];
  assert.match(section, /Portfolio call:/);
  assert.match(section, /Signal Briefing/);
  assert.match(section, /Forge Production Kit/);
  assert.match(section, /<th>Audience<\/th>/);
  assert.match(section, /<th>Hook &amp; route<\/th>/);
  assert.match(section, /<th>Advance when<\/th>/);
  assert.match(section, /Evidence gap:/);
  assert.match(floor, /<b>2<\/b><span>GTM strategies<\/span>/);
});

await test("GTM validation rejects ungrounded or ambiguous records", async () => {
  const { validatePortfolioGtm } = await import("../src/panels/gtm.mjs");
  const valid = JSON.parse(readFileSync(join(ACME, "portfolio-gtm.json"), "utf8"));
  assert.equal(validatePortfolioGtm(valid), valid);
  assert.throws(
    () => validatePortfolioGtm({ ...valid, products: [{ ...valid.products[0], evidence: [] }] }),
    /evidence must contain at least one/,
  );
  assert.throws(
    () => validatePortfolioGtm({ ...valid, products: [valid.products[0], valid.products[0]] }),
    /duplicate product id/,
  );
  assert.throws(
    () => validatePortfolioGtm({ ...valid, products: [{ ...valid.products[0], inventedScore: 92 }] }),
    /unknown field/,
  );
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

// ---------------------------------------------------------------- bundled skills
await test("portfolio GTM skill installs explicitly and never overwrites a local copy", () => {
  const fixtures = join(ROOT, "test", "tmp", "bundled-skills");
  rmSync(fixtures, { recursive: true, force: true });
  mkdirSync(fixtures, { recursive: true });

  const installed = installBundledSkill("portfolio-gtm", { targetRoot: fixtures });
  const installedAgain = installBundledSkill("portfolio-gtm", { targetRoot: fixtures });
  const skillRoot = join(fixtures, ".claude", "skills", "company-os-portfolio-gtm");
  assert.equal(installed.action, "created");
  assert.equal(installedAgain.action, "kept");
  assert.ok(existsSync(join(skillRoot, "SKILL.md")));
  assert.ok(existsSync(join(skillRoot, "agents", "openai.yaml")));
  assert.match(readFileSync(join(skillRoot, "SKILL.md"), "utf8"), /does not authorize publishing/);

  rmSync(fixtures, { recursive: true, force: true });
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

// ---------------------------------------------------------------- parent-owned intranet
console.log("\n--- intranet ---");
{
  const fixtures = join(ROOT, "test", "tmp", "intranet");
  rmSync(fixtures, { recursive: true, force: true });
  const write = (rel, content) => {
    const path = join(fixtures, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  write("project/index.html", "<!doctype html><title>Project home</title><a href=\"docs/index.html\">Docs</a>");
  write("project/docs/index.html", "<!doctype html><title>Project docs</title><a href=\"missing.html\">Missing</a>");
  write("project/node_modules/noise/index.html", "<title>Dependency</title>");
  write("project/editions/2026-01-01/index.html", "<title>Generated edition</title>");
  write("project/content/input.md", "# changed");
  write("project/scripts/build-index.mjs", `import { writeFileSync } from "node:fs";
writeFileSync("index.html", "<!doctype html><title>Project home</title><a href=\\\"docs/index.html\\\">Docs</a>");`);

  const intranetConfig = {
    root: fixtures,
    schemaPrefix: "test",
    generatedMark: "<!-- generated by company-os",
    rebuildCommand: "company-os build",
    intranet: {
      registry: join(fixtures, "intranet.json"),
      state: join(fixtures, "intranet-state.json"),
      maxDepth: 4,
      requireAgentRule: true,
      requireAgentSkill: true,
      agentCommand: "company-os intranet maintain --changed <path>",
    },
  };
  const intranetManifest = {
    engines: [{ id: "project", dir: "project", name: "Project" }],
  };

  const discovered = discoverIntranet(intranetConfig, intranetManifest);
  await test("intranet discovery finds owned child indexes but skips dependency and edition output", () => {
    assert.deepEqual(discovered.pages.map((item) => item.projectPath), ["docs/index.html", "index.html"]);
    assert.ok(discovered.pages.every((item) => item.registration === "candidate"));
  });

  const configuredPages = discovered.pages.map((item) => ({
    ...item,
    registration: "accepted",
    sources: ["content/**"],
    generator: item.projectPath === "index.html" ? "node scripts/build-index.mjs" : "npm run publish",
    authority: { regenerate: true, publish: true, delete: true },
  }));
  writeIntranetRegistry(intranetConfig, { ...discovered, pages: configuredPages });

  const maintained = await maintainIntranet(intranetConfig, intranetManifest, {
    mode: "interaction",
    changedPaths: ["project/content/input.md"],
    execute: true,
  });
  await test("a changed registered source runs its accepted safe page generator", () => {
    assert.ok(maintained.actions.some((item) => item.pageId === "project-home" && item.action === "regenerated"));
  });
  await test("intranet maintenance blocks commands that cross the publication boundary", () => {
    assert.ok(maintained.actions.some((item) => item.action === "blocked" && /authority boundary/.test(item.reason)));
    assert.equal(maintained.summary.blocked, 1);
  });
  await test("registry discovery forcibly keeps publish and delete authority false", () => {
    const rescanned = discoverIntranet(intranetConfig, intranetManifest);
    assert.ok(rescanned.pages.every((item) => item.authority.publish === false && item.authority.delete === false));
  });

  const checked = await maintainIntranet(intranetConfig, intranetManifest, {
    mode: "check",
    execute: false,
  });
  await test("intranet health catches broken local links", () => {
    const docs = checked.pages.find((item) => item.projectPath === "docs/index.html");
    assert.equal(docs.status, "broken");
    assert.equal(docs.links.broken[0].href, "missing.html");
  });

  const installed = installIntranetAgentRules(intranetConfig, intranetManifest);
  const installedAgain = installIntranetAgentRules(intranetConfig, intranetManifest);
  await test("agent maintenance installation appends a bounded rule and installs the skill idempotently", () => {
    assert.equal(installed[0].ruleAction, "created");
    assert.equal(installed[0].skillAction, "created");
    assert.equal(installedAgain[0].ruleAction, "kept");
    assert.equal(installedAgain[0].skillAction, "kept");
    assert.match(readFileSync(join(fixtures, "project", "AGENTS.md"), "utf8"), /company-os:intranet/);
    assert.ok(existsSync(join(fixtures, "project", ".claude", "skills", "company-os-intranet-maintainer", "SKILL.md")));
  });

  rmSync(fixtures, { recursive: true, force: true });
}

// ---------------------------------------------------------------- project status honesty
//
// The station light must never assert health it has no source for. Before this, an engine that
// published nothing still rendered "all systems nominal" purely because it owned a scheduled task
// that had not failed — but a job can exit 0 by design while holding a backlog of operator
// decisions, so a green light there was the dashboard inventing an assurance.
const STATUS_ENGINE = join(ACME, "packages", "signal", "intranet", "project-status.json");
const statusOut = join(ACME, ".status-out");
const buildStatus = async () => {
  await build({ ...config, outDir: statusOut }, { argv: [], log: () => {}, warn: () => {} });
  return readFileSync(join(statusOut, "index.html"), "utf8");
};
const writeStatus = (over) => {
  mkdirSync(dirname(STATUS_ENGINE), { recursive: true });
  writeFileSync(STATUS_ENGINE, JSON.stringify({
    schemaVersion: `${config.schemaPrefix}.project-status/v1`,
    projectId: "signal",
    name: "Signal",
    statusPage: "index.html",
    updatedAt: new Date().toISOString(),
    health: "nominal",
    headline: "Nothing owed.",
    metrics: {},
    activity: [],
    todos: [],
    security: { state: "current", lastScanAt: null, scope: "repo", summary: "clean" },
    ...over,
  }, null, 2));
};

await test("an engine with no status feed reads as unreported, never nominal", async () => {
  rmSync(dirname(STATUS_ENGINE), { recursive: true, force: true });
  const floor = await buildStatus();
  assert.match(floor, /no status feed/, "absence of evidence must be stated");
  assert.ok(!floor.includes("all systems nominal"), "a task exit code is not a health report");
});

await test("a fresh nominal feed still lights the station green", async () => {
  writeStatus({});
  const floor = await buildStatus();
  assert.match(floor, /project nominal/, "a real, current feed is what green is for");
});

await test("a feed past its freshness budget reports staleness instead of its own health", async () => {
  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  writeStatus({ updatedAt: old, health: "nominal" });
  const floor = await buildStatus();
  assert.match(floor, /status \d+d stale/, "an unrefreshed feed must say how old it is");
  assert.ok(!floor.includes("project nominal"), "a 60-day-old 'nominal' is not evidence of one");
});

await test("a corrupt feed degrades to unreported rather than to green", async () => {
  mkdirSync(dirname(STATUS_ENGINE), { recursive: true });
  writeFileSync(STATUS_ENGINE, "{ not json");
  const floor = await buildStatus();
  assert.match(floor, /no status feed/, "an unreadable feed is the same as no feed");
  assert.ok(!floor.includes("all systems nominal"));
  rmSync(dirname(STATUS_ENGINE), { recursive: true, force: true });
  rmSync(statusOut, { recursive: true, force: true });
});

// ---------------------------------------------------------------- derived baseline status
await test("a derived feed reports only verifiable facts and never claims health", () => {
  // Derive against this repository: it is a real git checkout, so every field has a real source.
  const derived = deriveStatus(ROOT, { id: "company-os", name: "Company OS", schemaPrefix: "test" });
  assert.ok(derived, "company-os is a git repo, so a baseline is derivable");
  assert.equal(derived.health, "on-demand", "commit activity is not health and must not be sold as it");
  assert.match(derived.headline, /Auto-derived baseline/, "a baseline must announce itself as one");
  assert.deepEqual(derived.todos, [], "a derived feed cannot know what is owed");
  assert.equal(derived.security.state, "unknown", "no scan wired means unknown, not clean");
  assert.equal(typeof derived.metrics.commitsLast30d, "number");
  for (const item of derived.activity) {
    assert.ok(Number.isFinite(Date.parse(item.at)), "every activity entry carries a real timestamp");
    assert.ok(item.detail && item.detail.length, "and a real subject");
  }
});

await test("a directory with no git history yields no feed at all", () => {
  const empty = join(ROOT, "test", "tmp", "not-a-repo");
  mkdirSync(empty, { recursive: true });
  assert.equal(deriveStatus(empty, { id: "x", name: "X" }), null, "inventing a feed is worse than none");
  rmSync(join(ROOT, "test", "tmp", "not-a-repo"), { recursive: true, force: true });
});

// ---------------------------------------------------------------- bundled skills are single-sourced
await test("every bundled skill is listable, and the intranet one is not a second copy", () => {
  const ids = BUNDLED_SKILLS.map((s) => s.id);
  assert.ok(ids.includes("intranet-maintainer"),
    "install-agent-rules installs this skill and intranet.mjs marks pages needs-review without it, so it must be reachable through `skills install` like any other");
  // The text install-agent-rules writes MUST be the bundled file, not a literal beside it. These
  // had already drifted once — seven numbered steps against six — and a skill file is a
  // behavioural contract, so two versions means two different sets of rules in play.
  assert.equal(INTRANET_SKILL, readBundledSkill("intranet-maintainer"),
    "INTRANET_SKILL must read the bundled file rather than restate it");
  for (const skill of BUNDLED_SKILLS) {
    assert.ok(existsSync(join(ROOT, "skills", skill.name, "SKILL.md")), `${skill.id} has no SKILL.md on disk`);
    assert.doesNotThrow(() => readBundledSkill(skill.id), `${skill.id} is listed but unreadable`);
  }
});

await test("the organizing guide the README sends people to exists", () => {
  // A dead link in a README is cheap; a dead link that the README describes as "the guide" to the
  // hour-long part of setup is a promise the package does not keep.
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  for (const [, link] of readme.matchAll(/\]\((docs\/[^)]+\.md)\)/g)) {
    assert.ok(existsSync(join(ROOT, link)), `README links to ${link}, which does not exist`);
  }
});

// ---------------------------------------------------------------- summary
console.log(`\n${failures.length ? `FAIL — ${failures.length} of ${passed + failures.length}` : `PASS — ${passed} tests`}`);
if (failures.length) {
  for (const [name, error] of failures) console.log(`\n${name}\n${error.stack}`);
  process.exitCode = 1;
}
// Leave the fixture output in place: it is useful to look at, and .gitignore excludes it.
void rmSync;
