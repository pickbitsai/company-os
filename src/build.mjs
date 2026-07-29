// Build orchestration.
//
// Safety rule inherited from the original generator, and the most important line in this file:
// only ever overwrite a file that carries our generated mark (or does not exist yet). A
// hand-authored dashboard in a project directory must survive a build that did not expect it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRenderer } from "./render.mjs";
import { engineScripts, ownsOwnIndex } from "./scripts.mjs";
import { writeSnapshots } from "./publish.mjs";
import { runPanels } from "./panels/index.mjs";
import { loadTasksSafely } from "./scheduler.mjs";
import { maintainIntranet } from "./intranet.mjs";

function loadGovernance(config) {
  if (!config.governance) return null;
  if (!existsSync(config.governance)) {
    if (config.requireGovernance) throw new Error(`governance file not found: ${config.governance}`);
    return null;
  }
  const governance = JSON.parse(readFileSync(config.governance, "utf8"));
  const expected = `${config.schemaPrefix}.ai-governance/v1`;
  if (governance.schemaVersion !== expected) {
    throw new Error(`${config.governance} has an unsupported schemaVersion (expected ${expected})`);
  }
  return governance;
}

// Governance validation is opt-in via requireGovernance, because a half-filled governance file is
// a real risk for the team that relies on it and pure noise for the team that does not.
function validateGovernance({ manifest, governance, config }) {
  if (!config.requireGovernance) return;
  if (!governance) throw new Error("requireGovernance is set but no governance file was loaded");
  for (const eng of manifest.engines) {
    if (!governance.engines?.[eng.id]) throw new Error(`AI governance has no engine profile for ${eng.id}`);
  }
  for (const [id, worker] of Object.entries(governance.workers || {})) {
    if (!worker.modelId || /(^|[-_])(latest|default)($|[-_])/i.test(worker.modelId)) {
      throw new Error(`AI governance worker ${id} does not pin an exact modelId`);
    }
  }
}

export async function build(config, { argv = [], log = console.log, warn = console.warn, now = new Date() } = {}) {
  const sitesOnly = argv.includes("--sites-only");
  const manifest = JSON.parse(readFileSync(config.manifest, "utf8"));
  if (!Array.isArray(manifest.engines)) {
    throw new Error(`${config.manifest} has no "engines" array`);
  }
  const governance = loadGovernance(config);
  validateGovernance({ manifest, governance, config });

  const { id: schedulerId, tasks, failed: schedulerFailed } = await loadTasksSafely(config.scheduler);
  // "none", or an adapter that could not run, means no scheduler was READ. The renderer needs to
  // know that so it reports declared tasks neutrally instead of warning they are missing.
  const observesScheduler = schedulerId !== "none" && !schedulerFailed;
  const nowIso = now.toISOString();
  const stamp = now.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  // The normal scheduled Company OS rebuild doubles as the intranet maintenance sweep when
  // configured. It always scans and validates. Generator execution remains a separate opt-in,
  // and each page must also be accepted and explicitly grant regeneration authority.
  const intranetState = !sitesOnly && config.intranet?.maintainOnBuild
    ? await maintainIntranet(config, manifest, {
      mode: "scheduled-sweep",
      execute: config.intranet.executeOnBuild === true,
      now,
      log,
    })
    : null;

  // Panels run before rendering because several contribute a hero stat and a nav link. A panel
  // that cannot collect (optional tool absent, viewer not running) is warned about and dropped.
  const panels = await runPanels({ config, manifest, governance, tasks, nowIso, intranetState }, { warn });

  const renderer = createRenderer({
    config, manifest, governance, tasks, stamp, nowIso, schedulerId, observesScheduler, panels, intranetState,
  });

  function safeWrite(path, html) {
    if (existsSync(path)) {
      const head = readFileSync(path, "utf8").slice(0, 400);
      if (!head.includes(config.generatedMark)) {
        warn(`SKIP ${path} — existing file is not company-os generated`);
        return false;
      }
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
    log(`wrote ${path}`);
    return true;
  }

  const written = [];
  writeSnapshots({ manifest, config, nowIso, log });

  if (!sitesOnly) {
    const masterPath = join(config.outDir, "index.html");
    if (safeWrite(masterPath, renderer.masterPage())) written.push(masterPath);

    for (const eng of manifest.engines) {
      const target = join(config.outDir, eng.dir, "index.html");
      if (ownsOwnIndex(config.root, eng, config.generatedMark)) {
        log(`skip ${eng.dir} — real dashboard already lives at its index.html`);
        // Its commands would otherwise have nowhere to live.
        if (engineScripts(config.root, eng).length) {
          const sheet = join(config.outDir, eng.dir, "ops-commands.html");
          if (safeWrite(sheet, renderer.commandsPage(eng))) written.push(sheet);
        }
        continue;
      }
      if (safeWrite(target, renderer.enginePage(eng))) written.push(target);
    }
  }

  log("done.");
  return { written, schedulerId, engines: manifest.engines.length };
}
