// Per-project npm command surface.
//
// Read straight off each project's package.json at build time so the list cannot go stale.
// The point of the section is not "here are 44 scripts" — it is "here are the 5 this company
// actually runs, and 39 others that exist". That distinction is what `wired`/`scheduled` carry.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// A manifest may address a project relatively ("packages/signal") or absolutely — the latter is
// common when entries come from a registry that records full folder paths. join(root, absolute)
// would silently concatenate the two roots into a path that exists nowhere, so branch on it.
export const projectPath = (root, dir) => (isAbsolute(dir) ? dir : join(root, dir));

// Flagged so the dashboard never reads as an invitation to paste a publish command without
// looking. Marking is visual only: copy buttons copy text, nothing here executes anything.
const DANGER_SCRIPT = /^(deploy|ship|publish|migrate|reset|purge|prune|drop|destroy)(:|$)/i;

const normCmd = (t) => String(t || "").replaceAll("\\", "/").replace(/\s+/g, " ").trim().toLowerCase();

export function packageScripts(root, dir) {
  if (!dir) return null;
  try {
    const scripts = JSON.parse(readFileSync(join(projectPath(root, dir), "package.json"), "utf8")).scripts;
    return scripts && typeof scripts === "object" ? scripts : null;
  } catch {
    return null; // no package.json, or unparseable — render nothing rather than guess.
  }
}

export function scanScripts(root, dir, { wired = new Set(), scheduled = new Set(), notes = {} } = {}) {
  const scripts = packageScripts(root, dir);
  if (!scripts) return [];
  const names = Object.keys(scripts);
  const own = new Set(names);
  return names
    // npm lifecycle wrappers around another script in the same file are noise, not commands.
    .filter((name) => !(/^(pre|post)(.+)$/.test(name) && own.has(name.replace(/^(pre|post)/, ""))))
    // `_note` and friends hold prose, not a command — `npm run _note` would just fail.
    // Their text is surfaced by scriptsNote() instead.
    .filter((name) => !name.startsWith("_"))
    .map((name) => ({
      name,
      cmd: scripts[name],
      group: name.includes(":") ? name.slice(0, name.indexOf(":")) : "general",
      wired: wired.has(name),
      scheduled: scheduled.has(name),
      danger: DANGER_SCRIPT.test(name),
      note: notes[name] || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Which scripts the manifest already puts to work.
//
// Two detectors, because manifests use both forms. Some pipeline nodes say `npm run lint`;
// scheduled ones typically invoke the underlying file directly (`node scripts/nightly.mjs`).
// Matching only the first form leaves the "scheduled" mark unable to fire on any project that
// schedules things the normal way — a badge that reads like a signal and never appears.
// Matching the script BODY finds the rest.
export function wiredScripts(root, eng) {
  const wired = new Set();
  const scheduled = new Set();
  const bodies = Object.entries(packageScripts(root, eng.dir) || {})
    .map(([name, body]) => [name, normCmd(body)])
    .filter(([, body]) => body);

  const harvest = (text, isScheduled) => {
    const mark = (name) => {
      wired.add(name);
      if (isScheduled) scheduled.add(name);
    };
    // Form 1 — an explicit `npm run <script>` reference.
    for (const m of String(text || "").matchAll(/\bnpm\s+(?:run\s+)?([a-z0-9][\w.:-]*)/gi)) {
      if (!["run", "install", "ci"].includes(m[1])) mark(m[1]);
    }
    // Form 2 — the command IS the script body, optionally plus arguments. Deliberately
    // one-directional: a node running `node x.mjs` must not also claim `x:check`
    // ("node x.mjs --check"), whose body is longer than what actually runs.
    const cmd = normCmd(text);
    if (!cmd) return;
    for (const [name, body] of bodies) {
      if (cmd === body || (cmd.startsWith(body) && /\s/.test(cmd[body.length] || ""))) mark(name);
    }
  };

  for (const node of eng.nodes || []) harvest(node.cmd, (node.tasks || []).length > 0);
  for (const server of eng.servers || []) harvest(server.start, false);
  return { wired, scheduled };
}

export function engineScripts(root, eng) {
  return scanScripts(root, eng.dir, { ...wiredScripts(root, eng), notes: eng.scriptNotes || {} });
}

// Many package.json files carry a `_note` entry that describes the project rather than running
// anything. Show it as what it is.
export function scriptsNote(root, dir) {
  const note = packageScripts(root, dir)?._note;
  return typeof note === "string" && note.trim() ? note.trim() : "";
}

export function scriptGroups(scripts) {
  const groups = new Map();
  for (const s of scripts) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  return [...groups.entries()].sort((a, b) =>
    a[0] === "general" ? 1 : b[0] === "general" ? -1 : a[0].localeCompare(b[0]));
}

// Projects that keep their own hand-built index.html never get one generated. Their commands
// would otherwise have nowhere to live, so they get a standalone ops-commands.html instead.
export function ownsOwnIndex(root, eng, generatedMark) {
  if (!eng.hasOwnDashboard) return false;
  const target = join(projectPath(root, eng.dir), "index.html");
  if (!existsSync(target)) return false;
  return !readFileSync(target, "utf8").slice(0, 400).includes(generatedMark);
}
