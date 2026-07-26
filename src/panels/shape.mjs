// Project shape panel — what each project actually IS, and whether it is one thing.
//
// Two questions people cannot answer about their own workspace:
//
//   1. KIND. Is this an agentic engine — a system of tools meant to be operated by an agent —
//      or a single-purpose CLI, a library, an app, a game? These want different treatment, and
//      a dashboard that renders them identically is hiding the most useful distinction in the
//      list.
//   2. COHERENCE. Is this project one thing, or a junk drawer that accumulated? A directory with
//      no stated purpose, no manifest and no history is not a project yet, and saying so is more
//      useful than listing it alongside things that ship.
//
// RULE, and the reason this panel is built the way it is: "your project is dirty" is a strong
// claim about someone's work. So this never renders a bare verdict. Every kind carries the
// evidence that produced it and a confidence, and every coherence finding is a specific,
// checkable observation ("no README", "41 loose files at root") rather than a judgement. A reader
// must be able to disagree with the conclusion by looking at the reasons.
//
// Where a signal cannot be read from the filesystem — are these skills real? is this contract
// enforced? — this panel does not guess. It emits a prompt for the reader's own agent to answer.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { projectPath } from "../scripts.mjs";

export const id = "shape";
export const title = "Project shape";
export const nav = "Shape";

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const has = (dir, f) => existsSync(join(dir, f));

// Dependency families that identify what a project is FOR. Deliberately narrow: a broad regex
// would match a transitive utility and assert a kind on no real evidence.
const DEP_KINDS = [
  { kind: "game", re: /^(phaser|three|pixi\.js|matter-js|excalibur|babylonjs|@babylonjs\/.+|@react-three\/.+)$/, why: "game engine dependency" },
  { kind: "app", re: /^(next|nuxt|astro|@remix-run\/.+|@angular\/core|svelte|vue|react-dom)$/, why: "web app framework" },
  { kind: "service", re: /^(express|fastify|koa|hapi|@nestjs\/core)$/, why: "HTTP server framework" },
];

function countSkills(dir) {
  const names = [];
  try {
    for (const e of readdirSync(join(dir, ".claude", "skills"), { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(join(dir, ".claude", "skills", e.name, "SKILL.md"))) names.push(e.name);
    }
  } catch {}
  try {
    for (const f of readdirSync(join(dir, "skills"))) if (f.endsWith(".md")) names.push(`skills/${f}`);
  } catch {}
  return names;
}

// Files a project declares as its contract with other systems: schemas, and the manifests this
// dashboard itself understands. Absence is not a fault — most projects have none — but presence
// is a strong sign of something built to be integrated rather than run by hand.
function findContracts(dir) {
  const found = [];
  for (const candidate of ["schemas", "contracts", "openapi.yaml", "openapi.json", "schema.json", "intranet/project-status.json"]) {
    const p = join(dir, candidate);
    if (!existsSync(p)) continue;
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        const n = readdirSync(p).filter((f) => /\.(json|ya?ml|ts|mjs)$/.test(f)).length;
        if (n) found.push(`${candidate}/ (${n})`);
      } else found.push(candidate);
    } catch {}
  }
  return found;
}

function looseRootFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith(".")).length;
  } catch { return 0; }
}

function ecosystems(dir) {
  const found = new Set();
  for (const [eco, file] of [["node", "package.json"], ["python", "requirements.txt"], ["python", "pyproject.toml"],
    ["rust", "Cargo.toml"], ["go", "go.mod"], ["ruby", "Gemfile"], ["php", "composer.json"], ["java", "pom.xml"]]) {
    if (has(dir, file)) found.add(eco);
  }
  try { if (readdirSync(dir).some((f) => /\.(sln|csproj)$/.test(f))) found.add("dotnet"); } catch {}
  return [...found];
}

/**
 * Classify one project. Returns a kind, a confidence, and the evidence — never a bare label.
 *
 * The strongest signal for "system of tools" turned out to be the NAMESPACED SCRIPT RATIO. A
 * system names its commands in families (`canvass:run`, `gates:schema`); a single-purpose tool
 * has no need to. Measured across 112 real directories this separated engines (74–87% namespaced)
 * from tools and apps (0–11%) more cleanly than the presence of any single file.
 */
function classify({ pkg, scripts, agentFiles, skills, contracts, manifestNodes, ecos }) {
  const namespaced = scripts.filter((s) => s.includes(":")).length;
  const nsRatio = scripts.length ? namespaced / scripts.length : 0;
  const depNames = Object.keys({ ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) });

  // Evidence is collected PER HYPOTHESIS, not into one pile. The panel displays the reasons for
  // the verdict it reached, and a reason that supports a rejected hypothesis must not appear
  // under the winner — "game, because CLAUDE.md is present" reads as rigour and is nonsense.
  const H = {
    engine: { score: 0, why: [] },
    cli: { score: 0, why: [] },
    library: { score: 0, why: [] },
    game: { score: 0, why: [] },
    app: { score: 0, why: [] },
    service: { score: 0, why: [] },
  };

  // --- agentic engine: built to be operated by an agent ---
  if (agentFiles.length) { H.engine.score += 2; H.engine.why.push(`${agentFiles.join(" + ")} present`); }
  if (skills.length) { H.engine.score += 2; H.engine.why.push(`${skills.length} skill${skills.length === 1 ? "" : "s"}`); }
  if (manifestNodes >= 3) { H.engine.score += 2; H.engine.why.push(`${manifestNodes} declared pipeline stages`); }
  if (scripts.length >= 15 && nsRatio >= 0.5) {
    H.engine.score += 2;
    H.engine.why.push(`${namespaced}/${scripts.length} commands namespaced (${Math.round(nsRatio * 100)}%)`);
  } else if (nsRatio >= 0.5 && scripts.length >= 6) {
    H.engine.score += 1;
    H.engine.why.push(`${namespaced}/${scripts.length} commands namespaced`);
  }
  if (contracts.length) { H.engine.score += 1; H.engine.why.push(`declares ${contracts.length} contract${contracts.length === 1 ? "" : "s"}`); }

  // --- what it is FOR, from dependencies. Checked before the library test on purpose: almost
  // every package.json has a `main`, so treating that as "library" would relabel every app.
  for (const { kind, re, why } of DEP_KINDS) {
    const hit = depNames.find((d) => re.test(d));
    if (hit) { H[kind].score += 3; H[kind].why.push(`${why} (${hit})`); }
  }

  // --- distributable ---
  if (pkg?.bin) { H.cli.score += 3; H.cli.why.push("exposes a CLI (bin)"); }
  // An `exports` map is a deliberate public API. A bare `main` is a default and proves nothing,
  // so it only counts when nothing else explains the project.
  if (pkg?.exports) { H.library.score += 3; H.library.why.push("declares an exports map (public API)"); }
  else if (pkg?.main) { H.library.score += 1; H.library.why.push("declares a main entry point"); }
  if (pkg && pkg.private !== true && pkg.version) {
    for (const h of ["cli", "library"]) if (H[h].score) { H[h].score += 1; H[h].why.push("publishable (not private)"); }
  }

  const KIND_LABEL = { engine: "agentic engine", cli: "tool (CLI)", library: "library", game: "game", app: "app", service: "service" };
  // Engine wins ties: a system of tools that also ships a CLI is still a system of tools, because
  // the operating surface is what determines how you work with it.
  const ORDER = ["engine", "game", "app", "service", "cli", "library"];
  const best = ORDER.reduce((a, b) => (H[b].score > H[a].score ? b : a), "engine");

  if (H[best].score >= 3) {
    return {
      kind: KIND_LABEL[best],
      confidence: H[best].score >= 5 ? "high" : "medium",
      evidence: H[best].why,
      nsRatio, namespaced,
    };
  }
  if (H.engine.score >= 2) {
    return { kind: "agentic engine", confidence: "low", evidence: H.engine.why, nsRatio, namespaced };
  }
  // A non-Node project is not unclassifiable — it just cannot be classified from package.json.
  // Say which ecosystem it is and that the reading is shallow, rather than implying emptiness.
  if (!pkg && ecos.length) {
    return {
      kind: `${ecos.join("/")} project`,
      confidence: "low",
      evidence: [`${ecos.join(" + ")} manifest, no package.json — kind not inferable from a file tree`],
      nsRatio, namespaced,
    };
  }
  if (scripts.length || pkg) {
    return { kind: "project", confidence: "low", evidence: ["a package.json with no distinguishing signals"], nsRatio, namespaced };
  }
  return { kind: "unclassified", confidence: "none", evidence: ["no manifest to read"], nsRatio, namespaced };
}

/**
 * Coherence observations — the "is this one thing?" question.
 *
 * Every entry is a fact with a threshold stated, never an adjective. The reader decides whether
 * a directory of 60 loose files is a problem in their workflow; the panel's job is to notice.
 */
function coherence({ dir, pkg, readme, git, loose, ecos, looseThreshold }) {
  const findings = [];
  if (!readme) findings.push({ level: "warn", text: "no README — nothing states what this is for" });
  if (!pkg && ecos.length === 0) findings.push({ level: "warn", text: "no manifest of any kind (package.json, pyproject, Cargo.toml…)" });
  if (!git) findings.push({ level: "warn", text: "not a git repository — no history, nothing to revert to" });
  if (loose > looseThreshold) findings.push({ level: "info", text: `${loose} files loose at the root (over ${looseThreshold})` });
  if (ecos.length > 1) findings.push({ level: "info", text: `${ecos.length} language ecosystems at the root: ${ecos.join(", ")}` });
  if (pkg && !Object.keys(pkg.scripts || {}).length && !pkg.bin && !pkg.exports && !pkg.main) {
    findings.push({ level: "info", text: "package.json declares no scripts and no entry point" });
  }
  // The junk-drawer case: no purpose, no manifest, no history. Stated as the conjunction rather
  // than as a label, because that is what makes it checkable.
  const junkDrawer = !readme && !pkg && !git;
  return { findings, junkDrawer };
}

export function collect({ config, manifest, settings = {} }) {
  const looseThreshold = settings.looseThreshold ?? 20;
  const projects = [];

  for (const eng of manifest.engines) {
    const dir = projectPath(config.root, eng.dir);
    if (!existsSync(dir)) continue;
    const pkg = readJson(join(dir, "package.json"));
    const scripts = Object.keys(pkg?.scripts || {}).filter((s) => !s.startsWith("_"));
    const agentFiles = ["CLAUDE.md", "AGENTS.md"].filter((f) => has(dir, f));
    const skills = countSkills(dir);
    const contracts = findContracts(dir);
    const readme = has(dir, "README.md");
    const git = has(dir, ".git");
    const loose = looseRootFiles(dir);
    const ecos = ecosystems(dir);

    const shape = classify({
      pkg, scripts, agentFiles, skills, contracts, ecos,
      manifestNodes: (eng.nodes || []).length,
    });
    const coh = coherence({ dir, pkg, readme, git, loose, ecos, looseThreshold });

    projects.push({
      id: eng.id, name: eng.name, dir: eng.dir, accent: eng.accent,
      ...shape, agentFiles, skills, contracts, readme, git, loose, ecosystems: ecos,
      findings: coh.findings, junkDrawer: coh.junkDrawer,
      scriptCount: scripts.length,
    });
  }

  const kinds = {};
  for (const p of projects) kinds[p.kind] = (kinds[p.kind] || 0) + 1;

  // What a filesystem scan cannot answer. Rather than guess, hand the reader a prompt for their
  // own agent — which is the only thing that can actually read the code and decide.
  const needsReview = projects.filter((p) => p.confidence === "low" || p.confidence === "none" || !p.agentFiles.length);

  return { projects, kinds, needsReview, looseThreshold };
}

export function stat(data) {
  const engines = data.projects.filter((p) => p.kind === "agentic engine").length;
  return { label: "agentic engines", value: engines };
}

const CONF_CHIP = { high: "chip ok", medium: "chip", low: "chip warn", none: "chip warn" };

export function render(data, { esc, cmdRow }) {
  if (!data.projects.length) return "";

  const kindSummary = Object.entries(data.kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `<span class="chip">${esc(kind)}: ${n}</span>`)
    .join("");

  const incoherent = data.projects.filter((p) => p.findings.length);
  const junk = data.projects.filter((p) => p.junkDrawer);

  const lead = junk.length
    ? `<p class="doc"><span class="chip bad">${junk.length} not a project yet</span> ${junk.map((p) => esc(p.name)).join(", ")} — no README, no manifest, no git history. Nothing here says what it is or lets you go back.</p>`
    : incoherent.length
      ? `<p class="doc"><span class="chip warn">${incoherent.length} with coherence gaps</span> Each one below states the specific observation. None of these are failures on their own — they are the things that make a directory hard to pick back up.</p>`
      : `<p class="doc"><span class="chip ok">all coherent</span> Every project states its purpose, declares a manifest, and has history.</p>`;

  const rows = data.projects.map((p) => {
    const conf = `<span class="${CONF_CHIP[p.confidence]}" title="confidence in this classification">${esc(p.confidence)}</span>`;
    const surface = [
      p.agentFiles.length ? `<span class="chip ok">${p.agentFiles.map((f) => esc(f.replace(".md", ""))).join(" ")}</span>` : "",
      p.skills.length ? `<span class="chip ok">${p.skills.length} skills</span>` : "",
      p.contracts.length ? `<span class="chip ok">${p.contracts.length} contracts</span>` : "",
    ].filter(Boolean).join("") || `<span class="chip">none</span>`;
    const gaps = p.findings.length
      ? `<ul class="gap-list" style="margin:0">${p.findings.map((f) => `<li>${esc(f.text)}</li>`).join("")}</ul>`
      : `<span class="chip ok">coherent</span>`;
    return `<tr><td><a href="${encodeURI(p.dir)}/index.html"><b>${esc(p.name)}</b></a></td>
<td><b>${esc(p.kind)}</b> ${conf}<br><span class="mono" style="color:#6f6f8c">${p.evidence.slice(0, 3).map(esc).join(" · ")}</span></td>
<td>${surface}</td><td>${gaps}</td></tr>`;
  }).join("");

  // The prompt is the honest answer to everything a directory listing cannot decide.
  const scanPrompt = `Audit each project in this workspace and tell me, per project: (1) is it one coherent thing or an accumulation — quote the files that made you decide; (2) what kind is it: agentic engine (a system of tools operated by an agent), single-purpose CLI, library, B2C app, B2B app, game, or scratch; (3) if it has no CLAUDE.md or AGENTS.md, draft one from what the code actually does — what it owns, what it must not do, how to run it; (4) if it has skills or contracts, say whether they are real and current or stale. Do not guess: if you cannot tell from the code, say so.`;

  return `<details class="ops-section" id="shape"${junk.length || incoherent.length ? " open" : ""}><summary>${esc(title)} <span class="section-count">${data.projects.length} projects · ${Object.keys(data.kinds).length} kind${Object.keys(data.kinds).length === 1 ? "" : "s"}${junk.length ? ` · ${junk.length} not a project yet` : ""}</span></summary>
<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">${lead}
<div class="chips">${kindSummary}</div>
<p class="doc" style="margin-top:10px">Kind is inferred from the filesystem, so every row shows the evidence and a confidence — disagree with the conclusion by reading the reasons. The strongest signal for a system of tools is how many of its commands are namespaced: a system names them in families, a single-purpose tool has no need to.</p></div>
<div class="table-shell"><table><tr><th>Project</th><th>Kind &amp; evidence</th><th>Agent surface</th><th>Coherence</th></tr>${rows}</table></div>
${data.needsReview.length ? `<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.07)">
<p class="doc"><b>${data.needsReview.length} project${data.needsReview.length === 1 ? "" : "s"} a directory listing cannot settle.</b> Whether a skill is current, whether a contract is enforced, whether the code is one thing — none of that is visible from a file tree. Hand this to your own agent instead of trusting a guess:</p>
${cmdRow(scanPrompt)}</div>` : ""}</details>`;
}
