// Policy panel — is the branch policy actually enforced, and what debt are we carrying?
//
// This panel READS a report; it never runs git. That is deliberate. Shelling out to git in 80+
// repositories at build time would make the dashboard slow and, worse, would make it a second
// source of truth that can disagree with the loop that actually enforces the policy. The producer
// (a closeout sweep run on a schedule) owns the measurement; this renders it.
//
// The contract with that producer is one JSON file per run:
//
//   { date, scanned, ungoverned: [name],
//     repos:      [{ name, branch, onProtected, governed, dirty, unpushed: [{branch, reason, quiet}] }],
//     proposals:  [{ name, branch, reason, note }],
//     accepted:   [{ name, branch, reason }],
//     actions: [], errors: [] }
//
// ABSENT DATA IS SHOWN AS ABSENT, in three specific ways this panel is responsible for:
//
//   1. A report is a snapshot with a timestamp. Rendering yesterday's counts without saying they
//      are yesterday's is the whole failure mode this project is organized against, so age is
//      always displayed and a stale report is called stale.
//   2. `scanned` and `governed` arrived after the first version of the producer. A report without
//      them has not measured coverage, so the panel says "not measured" — never "0 ungoverned",
//      which would be an all-clear nobody checked.
//   3. A proposal the sweep is not authorized to act on is not a task in progress. It is a
//      decision waiting on a human, and it is counted separately, because an alert that can never
//      clear teaches you to stop reading the panel.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const id = "policy";
export const title = "Branch policy & debt";
export const nav = "Policy";

const HOUR = 3600_000;

// The newest dated report in a directory, or the file itself if one was named directly.
function resolveReport(path) {
  if (!existsSync(path)) throw new Error(`no closeout report at ${path}`);
  if (statSync(path).isFile()) return path;
  const files = readdirSync(path).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`no dated closeout reports in ${path}`);
  return join(path, files[files.length - 1]);
}

export function collect({ config, manifest, settings = {}, nowIso }) {
  const configured = settings.reports || settings.file || "./logs/closeout";
  const path = isAbsolute(configured) ? configured : resolve(config.configDir, configured);
  const file = resolveReport(path);

  let report;
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`closeout report is not readable JSON (${file}): ${error.message}`);
  }

  const maxAgeHours = settings.maxAgeHours ?? 36;
  const reportedAt = Date.parse(report.date);
  const ageHours = Number.isFinite(reportedAt) ? (Date.parse(nowIso) - reportedAt) / HOUR : null;
  const stale = ageHours == null || ageHours > maxAgeHours;

  // Coverage arrived in a later version of the producer. Its absence is not a zero.
  const measuresCoverage = typeof report.scanned === "number" && Array.isArray(report.ungoverned);
  const repos = Array.isArray(report.repos) ? report.repos : [];
  const proposals = Array.isArray(report.proposals) ? report.proposals : [];
  // Accepted debt postdates the first producer too, so its absence is null, not zero — a report
  // that never tracked debt must not render as a company carrying none.
  const accepted = Array.isArray(report.accepted) ? report.accepted : null;

  // Engines are the curated set the rest of the dashboard is about. Everything else under the
  // scanned root is real and worth a number, but not worth ninety rows.
  // A report names repositories by directory. An engine's `dir` may BE that directory
  // ("warehouse") or sit inside it ("packages/signal"), so both ends are candidate keys —
  // matching only the first segment silently matches nothing on a nested layout.
  const engineDirs = new Map();
  for (const eng of manifest.engines) {
    const parts = String(eng.dir).split(/[\\/]/).filter(Boolean);
    for (const key of new Set([parts[0], parts[parts.length - 1]])) {
      if (key) engineDirs.set(key.toLowerCase(), eng);
    }
  }
  const engineRows = [];
  let otherWithFindings = 0;
  for (const repo of repos) {
    const eng = engineDirs.get(String(repo.name).toLowerCase());
    if (eng) engineRows.push({ ...repo, engineId: eng.id, engineName: eng.name, dir: eng.dir });
    else otherWithFindings++;
  }

  // Engines the report never mentioned. Either they are clean and governed, or they are not a git
  // repo at all — the panel cannot tell which, and says so rather than implying the first.
  const reported = new Set(repos.map((r) => String(r.name).toLowerCase()));
  const rowedEngines = new Set(engineRows.map((r) => r.engineId));
  const unreportedEngines = manifest.engines
    .filter((eng) => !rowedEngines.has(eng.id))
    .map((eng) => eng.name);

  const stuck = repos.filter((r) => r.onProtected && r.dirty);
  const ungovernedRepos = measuresCoverage ? report.ungoverned : [];
  const neverPushed = proposals.filter((p) => /never pushed/i.test(p.reason || ""));
  const unauthorized = proposals.filter((p) => /authorize/i.test(p.note || ""));

  const findings = [];
  if (stuck.length) {
    findings.push({
      key: "protected",
      message: "uncommitted work on a protected branch — the next non-derived commit will be refused",
      names: stuck.map((r) => `${r.name} (${r.branch})`),
    });
  }
  if (ungovernedRepos.length) {
    findings.push({
      key: "ungoverned",
      message: "no policy hooks installed — these repos are not enforced, they merely happen to comply",
      names: ungovernedRepos,
    });
  }
  if (unauthorized.length) {
    findings.push({
      key: "unauthorized",
      message: "branches the sweep proposed but is not authorized to push — each needs a decision, not a rerun",
      names: [...new Set(unauthorized.map((p) => p.name))],
    });
  }
  if (neverPushed.length) {
    findings.push({
      key: "unpushed",
      message: "branches that exist only on this machine — nothing off-disk has a copy",
      names: [...new Set(neverPushed.map((p) => p.name))],
    });
  }

  return {
    file,
    reportedAt: Number.isFinite(reportedAt) ? new Date(reportedAt).toISOString() : null,
    ageHours,
    stale,
    maxAgeHours,
    measuresCoverage,
    scanned: measuresCoverage ? report.scanned : null,
    applied: report.applied === true,
    engineRows,
    otherWithFindings,
    unreportedEngines,
    findings,
    acceptedCount: accepted ? accepted.length : null,
    acceptedRepos: accepted ? [...new Set(accepted.map((a) => a.name))] : [],
    proposalCount: proposals.length,
    actionCount: Array.isArray(report.actions) ? report.actions.length : 0,
  };
}

export function stat(data) {
  return { label: "repo findings", value: data.findings.reduce((n, f) => n + f.names.length, 0) };
}

function ageLabel(data) {
  if (data.ageHours == null) return "report has no timestamp";
  if (data.ageHours < 1) return "under an hour old";
  const h = Math.round(data.ageHours);
  return h < 48 ? `${h}h old` : `${Math.round(h / 24)} days old`;
}

export function render(data, { esc }) {
  if (!data.engineRows.length && !data.findings.length && !data.otherWithFindings) return "";

  const findingList = data.findings.length
    ? `<ul class="gap-list">${data.findings.map((f) => `<li><b>${f.names.length}</b> ${f.names.length === 1 ? "repo" : "repos"} — ${esc(f.message)}<br><span class="mono">${f.names.map(esc).join(" · ")}</span></li>`).join("")}</ul>`
    : `<p class="doc">No findings: every reported repo is governed, off a protected branch, and has its committed work pushed.</p>`;

  // The provenance line is not decoration. Every number above it came from one run at one moment,
  // and a reader who cannot see when that was has no way to judge any of them.
  const provenance = [
    data.stale
      ? `<span class="chip warn">stale — ${esc(ageLabel(data))}, expected within ${data.maxAgeHours}h</span>`
      : `<span class="chip ok">${esc(ageLabel(data))}</span>`,
    data.measuresCoverage
      ? `<span class="chip">${data.scanned} repos scanned</span>`
      : `<span class="chip warn">coverage not measured — this report predates governance tracking</span>`,
    data.applied ? `<span class="chip">sweep applied</span>` : `<span class="chip">dry run — nothing was pushed</span>`,
  ].join(" ");

  const rows = data.engineRows.map((r) => {
    const branch = r.branch
      ? `<span class="mono">${esc(r.branch)}</span>${r.onProtected ? ` <span class="chip warn">protected</span>` : ""}`
      : `<span class="chip">not measured</span>`;
    const governance = r.governed === undefined
      ? `<span class="chip">—</span>`
      : r.governed ? `<span class="chip ok">enforced</span>` : `<span class="chip warn">ungoverned</span>`;
    const unpushed = (r.unpushed || []).length;
    return `<tr><td><a href="${encodeURI(r.dir)}/index.html"><b>${esc(r.engineName)}</b></a></td>`
      + `<td>${branch}</td>`
      + `<td class="mono">${r.dirty ? `${r.dirty} file${r.dirty === 1 ? "" : "s"}` : "clean"}</td>`
      + `<td class="mono">${unpushed || "—"}</td>`
      + `<td>${governance}</td></tr>`;
  }).join("");

  const footNotes = [];
  // Debt is reported, never alerted. It is a standing decision someone already made, so it gets a
  // number you can watch grow — not a line item that asks to be dealt with again every morning.
  if (data.acceptedCount) {
    footNotes.push(`${data.acceptedCount} branch${data.acceptedCount === 1 ? "" : "es"} accepted as debt in <span class="mono">${data.acceptedRepos.map(esc).join(" · ")}</span> — counted, not proposed.`);
  }
  if (data.otherWithFindings) {
    footNotes.push(`${data.otherWithFindings} repo${data.otherWithFindings === 1 ? "" : "s"} outside the manifest also have loose work.`);
  }
  if (data.unreportedEngines.length) {
    footNotes.push(`Not in the report — clean, or not a git repo: <span class="mono">${data.unreportedEngines.map(esc).join(" · ")}</span>.`);
  }

  const findingCount = data.findings.reduce((n, f) => n + f.names.length, 0);
  return `<details class="ops-section" id="policy"${findingCount ? " open" : ""}><summary>${esc(title)} <span class="section-count">${findingCount ? `${findingCount} finding${findingCount === 1 ? "" : "s"}` : "clear"} · ${data.proposalCount} proposals${data.acceptedCount ? ` · ${data.acceptedCount} debt` : ""}</span></summary>
<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">${provenance}${findingList}</div>
${rows ? `<div class="table-shell"><table><tr><th>Project</th><th>Branch</th><th>Working tree</th><th>Unpushed</th><th>Policy</th></tr>${rows}</table></div>` : ""}
${footNotes.length ? `<div style="padding:10px 16px;border-top:1px solid rgba(255,255,255,.07)"><p class="doc">${footNotes.join(" ")}</p></div>` : ""}</details>`;
}
