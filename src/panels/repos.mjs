// Repositories panel — the git state of every repo in the workspace, read-only.
//
// The question this answers: where is work sitting that nothing will reconcile? Many projects,
// many agents, each correct in isolation — the failure mode is not a bad commit, it is a good
// commit parked on a branch nobody remembers, a dirty tree aging quietly, a main that is weeks
// behind the branch that actually deploys.
//
// RULE, inherited from the shape panel: every row shows the facts that produced it, with
// thresholds stated, never an adjective. "dirty-41 · touched 3d ago" is checkable; "messy" is
// not. And this panel is READ-ONLY by construction: it runs no fetch, no checkout, no clean —
// it never mutates a working tree it does not own. The loop that acts on these findings is a
// separate tool with separate, narrower authority; a reporting surface that also mutates is how
// 500 lines of someone else's in-flight work end up in a wrong-repo commit.
//
// Honesty notes baked into the output:
//   * ahead/behind is measured against the LAST-FETCHED remote refs. Without a fetch this can
//     understate drift, so the panel says "as of last fetch" instead of implying live truth.
//   * a branch named claude/... or codex/... that HEAD has sat on for weeks is a finding — but
//     some of those are deliberate (a production branch that happens to be agent-named), so the
//     config can declare expected branches per repo and the panel believes the declaration.

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const id = "repos";
export const title = "Repositories";
export const nav = "Repos";

// One git invocation, no shell. A repo can legitimately have thousands of dirty paths
// (one real case: 160), so the buffer is sized for that rather than for the happy path.
async function git(dir, args) {
  const { stdout } = await run("git", args, {
    cwd: dir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 20_000,
    windowsHide: true,
  });
  return stdout;
}

// Manifest files that mean "someone intended this to be a project". A directory with one of
// these and no .git has work that nothing can revert — that is the finding, not untidiness.
const PROJECT_MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "Gemfile", "composer.json"];

const AGENT_BRANCH = /^(claude|codex|agent|jules|copilot)\//;

/** Parse `git status --porcelain=v2 --branch`: branch facts + dirty/untracked counts + paths. */
function parseStatus(out) {
  const s = {
    head: "", upstream: "", ahead: 0, behind: 0,
    dirty: 0, untracked: 0, conflicted: 0, dirtyPaths: [],
  };
  for (const line of out.split("\n")) {
    if (line.startsWith("# branch.head ")) s.head = line.slice(14).trim();
    else if (line.startsWith("# branch.upstream ")) s.upstream = line.slice(18).trim();
    else if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) { s.ahead = +m[1]; s.behind = +m[2]; }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      s.dirty++;
      // v2 format: 8 fixed fields then the path ("2" lines append \torigPath — drop it).
      const path = line.split(" ").slice(8).join(" ").split("\t")[0];
      if (path) s.dirtyPaths.push(path);
    } else if (line.startsWith("u ")) s.conflicted++;
    else if (line.startsWith("? ")) s.untracked++;
  }
  return s;
}

/** Newest mtime among dirty paths — is this live work or an abandoned session? Sampling 25
 *  paths is enough to answer "days or hours", which is all the quiet-period question needs. */
function newestTouch(dir, paths) {
  let newest = 0;
  for (const p of paths.slice(0, 25)) {
    try { newest = Math.max(newest, statSync(join(dir, p)).mtimeMs); } catch {}
  }
  return newest || null;
}

const days = (ms) => Math.floor(ms / 86_400_000);

// A .git that git itself refuses is not an audit failure — it is a husk: a directory shaped like
// a repository with no repository inside (a real case had only `info/` in it). That is the SAME
// fact as having no git at all — work that nothing can revert — and belongs in that list, marked.
// Everything else is a genuine failure, reported with git's own first stderr line, because
// "Command failed: git status" tells the reader nothing they can act on.
function classifyFailure(name, error, { notRepos, failures }) {
  const detail = String(error.stderr || error.message || error);
  if (/not a git repository/i.test(detail)) notRepos.push(`${name} (a husk .git — directory exists, repository doesn't)`);
  else failures.push({ name, error: detail.split("\n").find((l) => l.trim() && !l.startsWith("Command failed")) || detail.split("\n")[0] });
}

async function auditRepo(dir, name, { staleDays, expected, now }) {
  const repo = {
    name, dir, findings: [],
    branch: "", upstream: "", ahead: 0, behind: 0,
    dirty: 0, untracked: 0, touchedDaysAgo: null,
    branches: 0, staleBranches: 0, stashes: 0, lightweightTags: 0,
    mainAhead: 0, mainBehind: 0, defaultBranch: "",
  };
  const note = (level, text) => repo.findings.push({ level, text });

  const status = parseStatus(await git(dir, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]));
  repo.branch = status.head;
  repo.upstream = status.upstream;
  repo.ahead = status.ahead;
  repo.behind = status.behind;
  repo.dirty = status.dirty;
  repo.untracked = status.untracked;

  // All refs in one read: local branches, remote branches, tags (with type), the stash.
  const refs = await git(dir, ["for-each-ref", "--format=%(objecttype)\t%(refname)\t%(committerdate:unix)",
    "refs/heads", "refs/remotes", "refs/tags", "refs/stash"]);
  const heads = [], remotes = new Set();
  for (const line of refs.split("\n")) {
    if (!line) continue;
    const [type, ref, date] = line.split("\t");
    if (ref.startsWith("refs/heads/")) heads.push({ name: ref.slice(11), date: +date || 0 });
    else if (ref.startsWith("refs/remotes/")) remotes.add(ref.slice(13));
    else if (ref.startsWith("refs/tags/")) { if (type === "commit") repo.lightweightTags++; }
    else if (ref === "refs/stash") repo.stashes++;
  }
  repo.branches = heads.length;

  const hasRemote = (await git(dir, ["remote"])).trim().length > 0;
  const expectedBranch = expected[name]?.branch;

  // --- current position ---
  if (status.head === "(detached)") {
    note("warn", "detached HEAD — commits made here belong to no branch");
  } else if (AGENT_BRANCH.test(status.head)) {
    const head = heads.find((h) => h.name === status.head);
    const age = head?.date ? days(now - head.date * 1000) : null;
    if (status.head === expectedBranch) {
      // Declared deliberate (e.g. a production branch that is agent-named). Believe it, say so.
      repo.expectedNote = expected[name].why || "declared expected in config";
    } else if (age !== null && age > 7) {
      note("warn", `parked on agent branch ${status.head} — last commit ${age}d ago, never reconciled`);
    }
  }
  if (status.conflicted) note("bad", `${status.conflicted} unresolved merge conflicts`);

  // --- upstream / remote ---
  if (hasRemote && !status.upstream && status.head && status.head !== "(detached)") {
    note("warn", `branch ${status.head} has no upstream — a push here fails silently`);
  }
  if (status.behind) note("warn", `${status.behind} behind ${status.upstream} (as of last fetch)`);
  if (status.ahead) note("info", `${status.ahead} ahead of ${status.upstream} — local commits not pushed`);
  if (!hasRemote) note("info", "no remote — history exists on this disk only");

  // --- main vs origin/main: is the branch of record even current? ---
  const def = heads.find((h) => h.name === "main") ? "main" : heads.find((h) => h.name === "master") ? "master" : "";
  repo.defaultBranch = def;
  if (def && remotes.has(`origin/${def}`)) {
    try {
      const lr = (await git(dir, ["rev-list", "--left-right", "--count", `${def}...origin/${def}`])).trim().split(/\s+/);
      repo.mainAhead = +lr[0] || 0;
      repo.mainBehind = +lr[1] || 0;
      if (repo.mainBehind) note("warn", `${def} is ${repo.mainBehind} behind origin/${def} (as of last fetch)`);
      if (repo.mainAhead && status.head !== def) note("info", `${def} carries ${repo.mainAhead} commits origin never got`);
    } catch {}
  }

  // --- working tree ---
  if (status.dirty || status.untracked) {
    const touched = newestTouch(dir, status.dirtyPaths);
    repo.touchedDaysAgo = touched ? days(now - touched) : null;
    const age = repo.touchedDaysAgo === null ? "" : repo.touchedDaysAgo === 0 ? " · touched today" : ` · last touched ${repo.touchedDaysAgo}d ago`;
    const level = status.dirty && repo.touchedDaysAgo !== null && repo.touchedDaysAgo > 2 ? "warn" : "info";
    note(level, `${status.dirty} modified · ${status.untracked} untracked${age}`);
  }

  // --- accumulation ---
  const cutoff = now / 1000 - staleDays * 86_400;
  repo.staleBranches = heads.filter((h) => h.name !== status.head && h.date && h.date < cutoff).length;
  if (repo.staleBranches >= 3) note("info", `${repo.staleBranches} branches with no commit in ${staleDays}d`);
  if (repo.stashes) note("info", `${repo.stashes} stash${repo.stashes === 1 ? "" : "es"} — work only git stash list remembers`);
  if (repo.lightweightTags) note("info", `${repo.lightweightTags} lightweight tag${repo.lightweightTags === 1 ? "" : "s"} (annotated tags push; these often don't)`);

  return repo;
}

// Nested repositories. A .git below the top level is one of three different facts, and the
// panel must not render them as one:
//   * SPLIT-BRAIN — the parent repo tracks files under the nested repo's path. Two histories
//     claim the same files; committing in either makes the other lie. This is the dangerous one.
//   * GITLINK — the nested repo was `git add`ed bare (mode 160000, no .gitmodules). A clone of
//     the parent gets an empty directory where a project should be.
//   * EMBED — untracked or ignored in the parent: the vendoring pattern. Fine, but the parent's
//     history cannot see this work, so the nested repo is audited as a repo in its own right.
// Recursion stops at each found repo: repo-in-repo-in-repo is a fact the row name would show
// anyway, and walking into every repo's interior would turn a scan into a crawl.
function findNestedRepos(dir, maxDepth, exclude, depth = 1) {
  if (depth > maxDepth) return [];
  const found = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".") || exclude.has(e.name)) continue;
    const sub = join(dir, e.name);
    if (existsSync(join(sub, ".git"))) found.push(sub); // .git file counts too — that's a worktree link
    else found.push(...findNestedRepos(sub, maxDepth, exclude, depth + 1));
  }
  return found;
}

/** How does the parent repo relate to a nested repo at relPath? See the taxonomy above. */
async function nestedRelation(parentDir, relPath) {
  const staged = (await git(parentDir, ["ls-files", "-s", "--", relPath])).trim();
  if (staged) {
    if (staged.split("\n").some((l) => l.startsWith("160000"))) return { kind: "gitlink" };
    return { kind: "split-brain", tracked: staged.split("\n").length };
  }
  try {
    await git(parentDir, ["check-ignore", "-q", relPath]);
    return { kind: "ignored" };
  } catch {
    return { kind: "untracked" };
  }
}

export async function collect({ config, manifest, settings = {} }) {
  const root = config.root;
  const staleDays = settings.staleDays ?? 45;
  const nestedDepth = settings.nestedDepth ?? 3;
  const expected = settings.expected ?? {};
  const exclude = new Set(["node_modules", ...(settings.exclude ?? [])]);
  const now = Date.now();

  // Engine names for cross-linking rows to their dashboards.
  const engineByDir = new Map((manifest.engines || []).map((e) => [e.dir, e]));

  const candidates = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || exclude.has(entry.name)) continue;
    candidates.push(entry.name);
  }

  const repos = [], notRepos = [], failures = [], backups = [];
  const queue = [...candidates];

  // A bounded pool: ~4 git reads per repo across ~90 repos is fine concurrent, hostile serial.
  const POOL = 8;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (queue.length) {
      const name = queue.shift();
      const dir = join(root, name);
      if (name.endsWith(".git")) { backups.push(name); continue; } // bare backup mirrors — nothing to audit

      let parentRepo = null;
      if (existsSync(join(dir, ".git"))) {
        try {
          parentRepo = await auditRepo(dir, name, { staleDays, expected, now });
          repos.push(parentRepo);
        } catch (error) {
          classifyFailure(name, error, { notRepos, failures });
        }
      } else if (PROJECT_MANIFESTS.some((m) => existsSync(join(dir, m)))) {
        // Not having git is only a finding when something says "project" — junk drawers are the
        // shape panel's subject, not this one's.
        notRepos.push(name);
      }

      // Nested repos below this directory — audited as repos in their own right, and their
      // relationship to the parent's history classified (see the taxonomy above).
      for (const nestedDir of findNestedRepos(dir, nestedDepth - 1, exclude)) {
        const fromRoot = nestedDir.slice(root.length + 1).replace(/\\/g, "/");
        try {
          const nested = await auditRepo(nestedDir, fromRoot, { staleDays, expected, now });
          nested.nested = true;
          repos.push(nested);
          if (parentRepo) {
            const rel = nestedDir.slice(dir.length + 1).replace(/\\/g, "/");
            const relation = await nestedRelation(dir, rel);
            if (relation.kind === "split-brain") {
              parentRepo.findings.push({ level: "bad", text: `${relation.tracked} files under ${rel}/ are tracked here AND by the nested repo — two histories claim the same files; a commit in either makes the other lie` });
            } else if (relation.kind === "gitlink") {
              parentRepo.findings.push({ level: "warn", text: `${rel} is committed as a bare gitlink with no .gitmodules — a clone gets an empty directory there` });
            } else if (relation.kind === "untracked") {
              parentRepo.findings.push({ level: "info", text: `embedded repo at ${rel}/ is untracked — invisible to this repo's history (gitignore it to declare the embed deliberate)` });
            }
            // "ignored" is the declared vendoring pattern — deliberate, so not a finding.
          }
        } catch (error) {
          classifyFailure(fromRoot, error, { notRepos, failures });
        }
      }
    }
  }));

  // The workspace root may itself be a repo (tracking everything the children don't). Audit it
  // last, under its own label, so its state is visible, not ambient.
  if (existsSync(join(root, ".git"))) {
    try {
      repos.push(await auditRepo(root, "(workspace root)", { staleDays, expected, now }));
    } catch (error) {
      classifyFailure("(workspace root)", error, { notRepos, failures });
    }
  }

  // --- main-reflects-prod ---
  // The branch of record vs what the world actually has. Declared per repo in config — the
  // panel never guesses which packages are MEANT to be on a registry. The version compared is
  // what MAIN says (`git show main:package.json`), not the working tree: the real incident this
  // check exists for was a repo whose main said 0.2.1 while the registry served 0.2.0 — the
  // security fixes existed, weren't live, and nothing surfaced it.
  const published = settings.published ?? {};
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  await Promise.all(Object.entries(published).map(async ([dirName, pkgName]) => {
    const r = repos.find((x) => x.name === dirName);
    if (!r) return;
    if (!r.defaultBranch) { r.findings.push({ level: "warn", text: `declared npm-published but has no main/master branch to compare against` }); return; }
    let mainVersion = null;
    try { mainVersion = JSON.parse(await git(join(root, dirName), ["show", `${r.defaultBranch}:package.json`])).version || null; } catch {}
    let pub = null, registryError = null;
    try {
      const { stdout } = await run(npmCmd, ["view", pkgName, "version"], { encoding: "utf8", timeout: 20_000, shell: true, windowsHide: true });
      pub = stdout.trim();
    } catch (error) {
      const msg = String(error.stderr || error.message || error);
      if (/E?404|not found/i.test(msg)) registryError = `${pkgName} is not on the registry (declared published in config)`;
      else registryError = `registry check failed — ${msg.split("\n").find((l) => l.includes("npm")) || "offline?"}`;
    }
    if (pub && mainVersion && pub !== mainVersion) {
      r.findings.push({ level: "bad", text: `registry serves ${pkgName}@${pub} but ${r.defaultBranch} says ${mainVersion} — the branch of record and what users install disagree` });
    } else if (pub && mainVersion) {
      r.prodNote = `npm ${pub} == ${r.defaultBranch}`;
    } else if (registryError) {
      r.findings.push({ level: "info", text: registryError });
    }
  }));

  // Sites that deploy from origin/main (push → auto-deploy): local main commits ARE undeployed
  // changes, which upgrades an otherwise-informational fact into a production gap.
  for (const dirName of settings.deploysFromMain ?? []) {
    const r = repos.find((x) => x.name === dirName);
    if (!r || !r.mainAhead) continue;
    r.findings.push({ level: "warn", text: `deploys from origin/${r.defaultBranch} — ${r.mainAhead} local ${r.defaultBranch} commit${r.mainAhead === 1 ? "" : "s"} are not live` });
  }

  for (const r of repos) r.engine = engineByDir.get(r.name) || null;

  const severity = { bad: 3, warn: 2, info: 1 };
  const weight = (r) => r.findings.reduce((a, f) => a + severity[f.level], 0);
  repos.sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name));

  return {
    repos, notRepos, failures, backups, staleDays,
    withFindings: repos.filter((r) => r.findings.length).length,
    dirtyTotal: repos.reduce((a, r) => a + r.dirty, 0),
  };
}

export function stat(data) {
  return { label: "repos with findings", value: data.withFindings };
}

const LEVEL_CHIP = { bad: "chip bad", warn: "chip warn", info: "chip" };

export function render(data, { esc }) {
  if (!data.repos.length) return "";

  const flagged = data.repos.filter((r) => r.findings.length);
  const clean = data.repos.filter((r) => !r.findings.length);

  const lead = `<p class="doc"><span class="chip ${flagged.length ? "warn" : "ok"}">${flagged.length} of ${data.repos.length} repos with findings</span> ${data.dirtyTotal} modified files are sitting uncommitted across the workspace.${data.notRepos.length ? ` <span class="chip bad">${data.notRepos.length} projects have no git at all</span> ${data.notRepos.map(esc).join(", ")} — work that nothing can revert.` : ""}</p>
<p class="doc">Read-only: this panel runs no fetch and touches no working tree, so ahead/behind counts are as of each repo's last fetch. Every finding is a checkable fact with its threshold stated — stale means no commit in ${data.staleDays} days. The reconcile loop that acts on these is a separate tool; today the panel's job is to make the drift visible.</p>`;

  const rows = flagged.map((r) => {
    const branchChip = r.branch === "(detached)"
      ? `<span class="chip bad">detached</span>`
      : `<span class="mono">${esc(r.branch)}</span>${r.expectedNote ? `<br><span class="chip ok" title="${esc(r.expectedNote)}">expected</span>` : ""}${r.prodNote ? `<br><span class="chip ok">${esc(r.prodNote)}</span>` : ""}`;
    const upstream = r.upstream
      ? `<span class="mono" style="color:#6f6f8c">${r.ahead ? `+${r.ahead}` : ""}${r.ahead && r.behind ? "/" : ""}${r.behind ? `-${r.behind}` : ""}${!r.ahead && !r.behind ? "in sync" : ""} vs ${esc(r.upstream)}</span>`
      : "";
    const tree = r.dirty || r.untracked
      ? `<b>${r.dirty}</b> modified · ${r.untracked} untracked${r.touchedDaysAgo !== null ? `<br><span class="mono" style="color:#6f6f8c">touched ${r.touchedDaysAgo === 0 ? "today" : `${r.touchedDaysAgo}d ago`}</span>` : ""}`
      : `<span class="chip ok">clean</span>`;
    const findings = `<ul class="gap-list" style="margin:0">${r.findings.map((f) => `<li><span class="${LEVEL_CHIP[f.level]}">${f.level}</span> ${esc(f.text)}</li>`).join("")}</ul>`;
    const label = r.engine
      ? `<a href="${encodeURI(r.engine.dir)}/index.html"><b>${esc(r.name)}</b></a>`
      : `<b>${esc(r.name)}</b>`;
    return `<tr><td>${label}</td><td>${branchChip}${upstream ? `<br>${upstream}` : ""}</td><td>${tree}</td><td>${findings}</td></tr>`;
  }).join("");

  const cleanLine = clean.length
    ? `<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.07)"><p class="doc"><span class="chip ok">${clean.length} clean</span> ${clean.map((r) => esc(r.name)).join(" · ")}</p></div>`
    : "";
  const failLine = data.failures.length
    ? `<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.07)"><p class="doc"><span class="chip bad">${data.failures.length} unreadable</span> ${data.failures.map((f) => `${esc(f.name)} (${esc(f.error)})`).join(" · ")}</p></div>`
    : "";

  return `<details class="ops-section" id="repos"${flagged.length ? " open" : ""}><summary>${esc(title)} <span class="section-count">${data.repos.length} repos · ${flagged.length} with findings${data.notRepos.length ? ` · ${data.notRepos.length} without git` : ""}</span></summary>
<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">${lead}</div>
<div class="table-shell"><table><tr><th>Repository</th><th>Branch</th><th>Working tree</th><th>Findings</th></tr>${rows}</table></div>
${cleanLine}${failLine}</details>`;
}
