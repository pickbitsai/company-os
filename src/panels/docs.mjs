// Docs & agent files panel.
//
// Answers "what is missing" across every project at once: no README, no CLAUDE.md, a .env with
// no .env.example. The gap report leads because that is the actionable half — a grid of
// checkmarks reads as "fine" at a glance even when four projects have no documentation at all.
//
// No dependencies: this is a directory listing and some rules about what ought to exist.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { projectPath } from "../scripts.mjs";

export const id = "docs";
export const title = "Docs & agent files";
export const nav = "Docs";

// The default set. Each entry is one column in the matrix; `gap` describes what its absence
// means, and only entries with a `gap` produce a finding.
const DEFAULT_FILES = [
  { file: "README.md", label: "README", gap: "no README — a new reader (or agent) has no entry point" },
  { file: "CLAUDE.md", label: "CLAUDE", gap: "no CLAUDE.md — agents get no project-specific instructions" },
  { file: "AGENTS.md", label: "AGENTS", gap: "no AGENTS.md" },
  { file: ".env.example", label: ".env.ex", requires: ".env", gap: "has .env but no .env.example — nobody can reproduce the environment" },
  { file: ".mcp.json", label: ".mcp" },
  { file: "CONTRIBUTING.md", label: "CONTRIB" },
  { file: "LICENSE", label: "LICENSE" },
];

function countSkills(dir) {
  let n = 0;
  try {
    for (const e of readdirSync(join(dir, ".claude", "skills"), { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(join(dir, ".claude", "skills", e.name, "SKILL.md"))) n++;
    }
  } catch {}
  try {
    n += readdirSync(join(dir, "skills")).filter((f) => f.endsWith(".md")).length;
  } catch {}
  return n;
}

export function collect({ config, manifest, settings = {} }) {
  const files = settings.files || DEFAULT_FILES;
  const projects = [];

  for (const eng of manifest.engines) {
    const dir = projectPath(config.root, eng.dir);
    const present = {};
    for (const spec of files) {
      const path = join(dir, spec.file);
      present[spec.file] = existsSync(path)
        ? { exists: true, modifiedAt: statSync(path).mtime }
        : { exists: false };
    }
    projects.push({
      id: eng.id,
      name: eng.name,
      dir: eng.dir,
      present,
      skills: countSkills(dir),
    });
  }

  // A gap is only a gap when the file is expected. `.env.example` matters only where a `.env`
  // actually exists — flagging it everywhere would bury the four projects that need it.
  const gaps = [];
  for (const spec of files) {
    if (!spec.gap) continue;
    const missing = projects.filter((p) => {
      if (p.present[spec.file]?.exists) return false;
      if (spec.requires) return existsSync(join(projectPath(config.root, p.dir), spec.requires));
      return true;
    });
    if (missing.length) gaps.push({ file: spec.file, message: spec.gap, projects: missing.map((p) => p.name) });
  }

  return { files, projects, gaps, skillTotal: projects.reduce((n, p) => n + p.skills, 0) };
}

export function stat(data) {
  return { label: "doc gaps", value: data.gaps.reduce((n, g) => n + g.projects.length, 0) };
}

export function render(data, { esc }) {
  if (!data.projects.length) return "";

  const gapList = data.gaps.length
    ? `<ul class="gap-list">${data.gaps.map((g) => `<li><b>${g.projects.length}</b> ${g.projects.length === 1 ? "project" : "projects"} — ${esc(g.message)}<br><span class="mono">${g.projects.map(esc).join(" · ")}</span></li>`).join("")}</ul>`
    : `<p class="doc">No gaps: every project has a README, agent instructions, and an .env.example where it keeps a .env.</p>`;

  const head = data.files.map((f) => `<th>${esc(f.label)}</th>`).join("");
  const rows = data.projects.map((p) => {
    const cells = data.files.map((f) => {
      const hit = p.present[f.file]?.exists;
      return `<td>${hit ? `<span class="chip ok">yes</span>` : `<span class="chip">—</span>`}</td>`;
    }).join("");
    return `<tr><td><a href="${encodeURI(p.dir)}/index.html"><b>${esc(p.name)}</b></a></td>${cells}<td class="mono">${p.skills || "—"}</td></tr>`;
  }).join("");

  const gapCount = data.gaps.reduce((n, g) => n + g.projects.length, 0);
  return `<details class="ops-section" id="docs"${gapCount ? " open" : ""}><summary>${esc(title)} <span class="section-count">${gapCount ? `${gapCount} gap${gapCount === 1 ? "" : "s"}` : "complete"} · ${data.skillTotal} skills</span></summary>
<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">${gapList}</div>
<div class="table-shell"><table><tr><th>Project</th>${head}<th>Skills</th></tr>${rows}</table></div></details>`;
}
