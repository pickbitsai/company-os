// Config loading and defaults.
//
// Everything the generator once hard-coded lives here. Paths in a config file resolve relative
// to that file's own directory, so a config can be moved without rewriting every path in it.

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_NAMES = ["company-os.config.mjs", "company-os.config.js", "company-os.config.json"];

export const DEFAULT_BRAND = {
  name: "Company OS",
  mark: "OS",
  kicker: "local · virtual company",
  // Rendered as raw HTML so a headline can break across lines.
  headline: "Every project.<br>One living company.",
  blurb: "Each project has a face, a desk, and a place in the company. The floor is the friendly layer; live schedules, commands, and the real control surfaces sit underneath.",
  themeKey: "company-os-theme",
  floorHeading: "Choose the company you want to walk into",
  floorSubheading: "Same projects and live state, three visual worlds. Your choice is remembered on this machine.",
  floorAria: "virtual company floor",
  // Per-project page chrome.
  opsLabel: "Company OS",
  engineKicker: "engine · operational dashboard",
  commandsKicker: "engine · command surface",
  // Section titles that differ by scheduler ("Task Scheduler" vs "Scheduled jobs" vs "Cron").
  schedulesTitle: "Scheduled jobs",
  // Prefix on each station's path label, e.g. "C:\\new\\" -> "C:\\new\\newsroom".
  pathPrefix: "",
  // Shown in the generated-file banner and the footer, so a reader can find the inputs.
  manifestLabel: "your manifest",
  footData: "the Company OS manifest + live scheduler state",
  policyLabel: "the governance manifest",
};

export function findConfig(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function loadConfig(configPath) {
  const abs = resolve(configPath);
  if (!existsSync(abs)) throw new Error(`config not found: ${abs}`);
  const base = dirname(abs);
  const raw = abs.endsWith(".json")
    ? JSON.parse(readFileSync(abs, "utf8"))
    : (await import(pathToFileURL(abs).href)).default;
  if (!raw || typeof raw !== "object") throw new Error(`config ${abs} did not export an object`);
  return normalizeConfig(raw, base);
}

const rel = (base, p) => (p == null ? null : isAbsolute(p) ? p : resolve(base, p));

export function normalizeConfig(raw, base) {
  const root = rel(base, raw.root || ".");
  const config = {
    configDir: base,
    root,
    // Where generated pages land. Defaults to root so `<root>/index.html` is the company floor.
    outDir: rel(base, raw.outDir || raw.root || "."),
    manifest: rel(base, raw.manifest || "./engines.json"),
    governance: raw.governance === false ? null : rel(base, raw.governance || "./ai-governance.json"),
    // Governance is optional by default. Set `requireGovernance: true` to make a missing profile
    // or an unpinned model a hard build failure — worth doing if anyone relies on the governance
    // table being complete, and pure noise if you do not keep one.
    requireGovernance: raw.requireGovernance === true,
    brand: { ...DEFAULT_BRAND, ...(raw.brand || {}) },
    // Directory of <engineId>.webp mascots. Omit for the built-in CSS figures.
    avatars: rel(base, raw.avatars),
    // How that directory is addressed FROM the emitted company floor. Only the master page
    // renders avatars, so this is a single page-relative prefix, not a per-page calculation.
    avatarsHref: raw.avatarsHref || "assets/avatars",
    // Optional per-theme backdrop images. Omit for the built-in CSS gradients.
    backdrops: raw.backdrops || null,
    scheduler: raw.scheduler,
    // Extra tables rendered in the operations directory, each from a JSON file.
    collections: Array.isArray(raw.collections) ? raw.collections : [],
    // Optional cross-project panels: { env: {...}, docs: {...}, sessions: {...} }. Each is off
    // unless present here, and each degrades to nothing if its optional tool is unavailable.
    panels: raw.panels && typeof raw.panels === "object" ? raw.panels : {},
    // Optional parent-owned intranet inventory. The registry describes accepted child pages;
    // state is a generated scan receipt. Both resolve relative to the config, not the package.
    intranet: raw.intranet && typeof raw.intranet === "object"
      ? {
        ...raw.intranet,
        registry: rel(base, raw.intranet.registry || "./intranet.json"),
        state: rel(base, raw.intranet.state || "./intranet-state.json"),
      }
      : null,
    // Optional generated-report index (a directory of dated files).
    reports: raw.reports || null,
    // Optional hook returning extra markup for the governance panel (chips, measurements).
    // Governance vocabulary is organisation-specific, so the package renders none by default.
    governanceChips: typeof raw.governanceChips === "function" ? raw.governanceChips : null,
    // Optional hook returning the governance policy provenance line.
    governanceProvenance: typeof raw.governanceProvenance === "function" ? raw.governanceProvenance : null,
    // Optional safe public projections of the manifest. Paths resolve like every other path.
    publish: (Array.isArray(raw.publish) ? raw.publish : []).map((t) => ({ ...t, dir: rel(base, t.dir) })),
    publishNotice: raw.publishNotice
      || `Generated by ${raw.rebuildCommand || "npx company-os build"}. Edit the Company OS manifest, not this file.`,
    // Prefix for schemaVersion strings, so an existing fleet of status files keeps validating.
    schemaPrefix: raw.schemaPrefix || "company-os",
    projectStatusFile: raw.projectStatusFile || "intranet/project-status.json",
    // Days a project-status feed stays trustworthy. Past this the station reports the staleness
    // instead of the feed's own health, because an unrefreshed "nominal" is not evidence of one.
    // Set to 0 to disable the check.
    projectStatusMaxAgeDays: raw.projectStatusMaxAgeDays ?? 14,
    generatedMark: raw.generatedMark || "<!-- generated by company-os",
    // Shown in the page footer so a reader knows how to regenerate.
    rebuildCommand: raw.rebuildCommand || "npx company-os build",
  };
  // The generated-file banner and the footer quote the rebuild command separately, and are
  // allowed to differ: a banner reads better with a short relative path, a footer with the
  // absolute one you can paste anywhere. Default them to the same value.
  config.brand.rebuildHint = raw.brand?.rebuildHint || config.rebuildCommand;
  if (!existsSync(config.manifest)) {
    throw new Error(`manifest not found: ${config.manifest} (set "manifest" in your config)`);
  }
  return config;
}
