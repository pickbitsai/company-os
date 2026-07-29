#!/usr/bin/env node
// CLI.
//   company-os build                        # find company-os.config.mjs upward from cwd
//   company-os build --config path/to/dir   # or a direct path to a config file
//   company-os build --sites-only           # refresh publish targets only, skip the HTML
//   company-os init                         # write a starter config and empty manifest
//   company-os skills list                  # list bundled, opt-in agent skills
//   company-os skills install portfolio-gtm # install without overwriting local work
//   company-os status                       # derive a baseline feed for engines publishing none
//   company-os status --engine forge --force # re-derive one, overwriting its existing feed
//   company-os intranet scan --init         # discover child indexes and write the registry
//   company-os intranet maintain --changed  # maintain pages affected by changed paths
//   company-os intranet sweep               # scheduled full freshness/link scan

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import {
  BUNDLED_SKILLS,
  build,
  discoverIntranet,
  findConfig,
  installBundledSkill,
  installIntranetAgentRules,
  loadConfig,
  maintainIntranet,
  writeDerivedStatus,
  writeIntranetRegistry,
} from "../src/index.mjs";

const args = argv.slice(2);
const command = args.find((a) => !a.startsWith("-")) || "build";

function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  const value = args[i + 1];
  return value && !value.startsWith("--") ? value : null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function flagValues(name) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && args[i + 1] && !args[i + 1].startsWith("--")) values.push(args[i + 1]);
  }
  return values;
}

// --config accepts a file or a directory; a directory is searched for the usual config names.
function resolveConfigPath() {
  const supplied = flag("config");
  if (!supplied) {
    const found = findConfig(cwd());
    if (!found) {
      console.error("no company-os config found. Run `company-os init`, or pass --config <path>.");
      exit(1);
    }
    return found;
  }
  const abs = resolve(supplied);
  if (!existsSync(abs)) {
    console.error(`--config path does not exist: ${abs}`);
    exit(1);
  }
  const asDir = findConfig(abs);
  if (!asDir) {
    console.error(`no config file found at or above ${abs}`);
    exit(1);
  }
  return asDir;
}

const STARTER = `// Company OS config. Docs: https://github.com/pickbitsai/company-os
export default {
  // Where your projects live. Every engine "dir" is relative to this.
  root: ".",
  manifest: "./engines.json",

  brand: {
    name: "My Company OS",
    mark: "MC",
    headline: "Six projects.<br>One living company.",
  },

  // "schtasks" (Windows) | "cron" (macOS/Linux) | "none". Omit to pick by platform.
  // scheduler: "none",

  // Optional mascot art: a directory of <engineId>.webp. Omit for the built-in CSS figures.
  // avatars: "./assets/avatars",
};
`;

const STARTER_MANIFEST = `${JSON.stringify({ engines: [] }, null, 2)}\n`;

if (command === "init") {
  const target = join(cwd(), "company-os.config.mjs");
  const manifestTarget = join(cwd(), "engines.json");
  if (existsSync(target)) {
    console.error(`refusing to overwrite ${target}`);
    exit(1);
  }
  writeFileSync(target, STARTER);
  const manifestStatus = existsSync(manifestTarget)
    ? `kept existing ${manifestTarget}`
    : (writeFileSync(manifestTarget, STARTER_MANIFEST), `wrote ${manifestTarget}`);
  console.log(`wrote ${target}\n${manifestStatus}\nNext: run \`company-os build\`.`);
  exit(0);
}

if (command === "skills") {
  const actionIndex = args.indexOf("skills") + 1;
  const action = args[actionIndex] && !args[actionIndex].startsWith("--") ? args[actionIndex] : "list";
  if (action === "list") {
    for (const skill of BUNDLED_SKILLS) console.log(`${skill.id}\t${skill.description}`);
    exit(0);
  }
  if (action === "install") {
    const id = args[actionIndex + 1] && !args[actionIndex + 1].startsWith("--") ? args[actionIndex + 1] : null;
    if (!id) {
      console.error("usage: company-os skills install <skill> [--target <directory>]");
      exit(1);
    }
    try {
      const result = installBundledSkill(id, { targetRoot: flag("target") || cwd() });
      console.log(`${result.id}: ${result.action} ${result.target}`);
      exit(0);
    } catch (error) {
      console.error(`company-os skills failed: ${error.message}`);
      exit(1);
    }
  }
  console.error(`unknown skills action "${action}" — expected list or install`);
  exit(1);
}

if (command === "status") {
  // Writes a derived baseline feed for engines that publish none, so their stations stop
  // rendering as unreported. --force overwrites a hand-authored or project-emitted feed, which
  // is normally exactly the wrong thing to do — a real feed always beats a derived one.
  const configPath = resolveConfigPath();
  try {
    const config = await loadConfig(configPath);
    const manifest = JSON.parse(readFileSync(config.manifest, "utf8"));
    const only = flag("engine");
    const force = hasFlag("force");
    let wrote = 0;
    let kept = 0;
    for (const eng of manifest.engines) {
      if (only && eng.id !== only) continue;
      const relative = eng.statusFile || config.projectStatusFile;
      const dir = join(config.root, eng.dir);
      if (!force && existsSync(join(dir, relative))) {
        kept++;
        console.log(`kept    ${eng.id} — already publishes ${relative}`);
        continue;
      }
      const out = writeDerivedStatus(dir, relative, {
        id: eng.id,
        name: eng.name || eng.id,
        statusPage: eng.hasOwnDashboard === false ? "index.html" : "index.html",
        schemaPrefix: config.schemaPrefix,
      });
      if (out) {
        wrote++;
        console.log(`derived ${eng.id} -> ${relative}`);
      } else {
        console.log(`skipped ${eng.id} — not a git repository, nothing verifiable to report`);
      }
    }
    console.log(`\n${wrote} derived, ${kept} left alone (a project's own feed always wins).`);
    exit(0);
  } catch (error) {
    console.error(`company-os status failed: ${error.message}`);
    exit(1);
  }
}

if (command === "intranet") {
  const actionIndex = args.indexOf("intranet") + 1;
  const action = args[actionIndex] && !args[actionIndex].startsWith("--") ? args[actionIndex] : "scan";
  const configPath = resolveConfigPath();
  try {
    const config = await loadConfig(configPath);
    if (!config.intranet) throw new Error("intranet is not configured");
    const manifest = JSON.parse(readFileSync(config.manifest, "utf8"));

    if (action === "scan") {
      const registry = discoverIntranet(config, manifest);
      const shouldWrite = hasFlag("init") || hasFlag("write");
      if (shouldWrite) console.log(`wrote ${writeIntranetRegistry(config, registry)}`);
      const candidates = registry.pages.filter((page) => page.registration !== "accepted").length;
      console.log(`intranet scan: ${registry.pages.length} pages · ${candidates} candidates${shouldWrite ? "" : " · dry run"}`);
      exit(0);
    }

    if (action === "maintain" || action === "sweep") {
      // Interaction commands are normally run from the repository being changed, while the
      // Company OS root is its parent. Resolve here so `--changed producers/foo.mjs` means the
      // caller's repository path rather than `<company-root>/producers/foo.mjs`.
      const changedPaths = flagValues("changed")
        .flatMap((value) => value.split(","))
        .filter(Boolean)
        .map((value) => resolve(cwd(), value));
      const state = await maintainIntranet(config, manifest, {
        mode: action === "sweep" ? "scheduled-sweep" : "interaction",
        changedPaths,
        execute: !hasFlag("check-only"),
        log: console.log,
      });
      console.log(`intranet ${action}: ${state.pages.length} pages · ${JSON.stringify(state.summary)} · ${state.actions.length} actions`);
      const failed = (state.summary.blocked || 0) + (state.summary.broken || 0) + (state.summary.missing || 0);
      exit(failed ? 1 : 0);
    }

    if (action === "install-agent-rules") {
      const results = installIntranetAgentRules(config, manifest, { projectIds: flagValues("project") });
      for (const result of results) {
        console.log(`${result.projectId}: AGENTS ${result.ruleAction} · skill ${result.skillAction}`);
      }
      exit(0);
    }

    throw new Error(`unknown intranet action "${action}"`);
  } catch (error) {
    console.error(`company-os intranet failed: ${error.message}`);
    exit(1);
  }
}

if (command !== "build") {
  console.error(`unknown command "${command}" — expected build, init, skills, or intranet`);
  exit(1);
}

const configPath = resolveConfigPath();
try {
  const config = await loadConfig(configPath);
  console.log(`company-os · config ${basename(configPath)} · manifest ${config.manifest}`);
  await build(config, { argv: args });
} catch (error) {
  console.error(`company-os build failed: ${error.message}`);
  exit(1);
}
