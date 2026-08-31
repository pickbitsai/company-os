// Auto-derived project status.
//
// A project that publishes nothing renders as "no status feed" — honest, but it tells a reader
// nothing. This produces a BASELINE feed from facts that can be verified without knowing anything
// about what the project does: git history, working-tree state, and its scheduled jobs.
//
// What it deliberately does NOT do is guess at health. Commit velocity is not project health — a
// finished tool commits nothing for months and is fine, and a thrashing repo commits hourly and is
// not. So a derived feed always reports `health: "on-demand"`, which the station renders neutrally.
// Only a project that knows its own definition of "owed work" can claim nominal or attention, and
// the way to do that is to replace this file with a real emitter (see asset-factory's
// tracker/build-gaps.mjs, which computes its backlog and emits the feed as a byproduct).
//
// The headline says it is auto-derived, so nobody mistakes a baseline for a curated rollup.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const git = (dir, args) => {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Build a baseline status object for one project. Returns null when the directory is not a git
 * repository — with no history there is nothing verifiable to report, and inventing a feed would
 * be worse than the absent one.
 */
export function deriveStatus(projectDir, { id, name, statusPage = "index.html", schemaPrefix = "company-os", now = new Date(), tasks = [] } = {}) {
  // Must be a repository ROOT, not merely inside one. `rev-parse --git-dir` walks upward, so any
  // plain subdirectory of a repo answers yes — and the feed would then report the PARENT's whole
  // history as if it were this project's.
  if (!existsSync(projectDir)) return null;
  const top = git(projectDir, ["rev-parse", "--show-toplevel"]);
  if (!top || resolve(top) !== resolve(projectDir)) return null;

  const lastIso = git(projectDir, ["log", "-1", "--format=%cI"]);
  const lastAt = lastIso ? new Date(lastIso) : null;
  const daysSince = lastAt ? Math.floor((now - lastAt) / 86400000) : null;
  const commits30d = Number(git(projectDir, ["rev-list", "--count", "--since=30.days", "HEAD"]) ?? 0) || 0;
  const branch = git(projectDir, ["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
  const porcelain = git(projectDir, ["status", "--porcelain"]) || "";
  const dirty = porcelain ? porcelain.split("\n").filter(Boolean).length : 0;

  // Recent commits are the only activity this can honestly report: each entry is a real event
  // with a real timestamp, not a summary someone would have to keep current.
  const log = git(projectDir, ["log", "-5", "--format=%cI%x1f%s"]) || "";
  const activity = log.split("\n").filter(Boolean).map((line) => {
    const [at, subject] = line.split("\x1f");
    return { at, label: "Commit", detail: subject || "(no subject)" };
  });

  const failing = tasks.filter((t) => t.ok === false && !t.disabled && !t.missing);

  const headline = `Auto-derived baseline — no curated feed yet. `
    + (daysSince === null
      ? "No commits on record."
      : `Last commit ${daysSince === 0 ? "today" : `${plural(daysSince, "day")} ago`} on ${branch}, ${plural(commits30d, "commit")} in 30d.`)
    + (dirty ? ` ${plural(dirty, "uncommitted change")} in the working tree.` : "")
    + (failing.length ? ` ${plural(failing.length, "scheduled job")} failing.` : "");

  return {
    schemaVersion: `${schemaPrefix}.project-status/v1`,
    projectId: id,
    name,
    statusPage,
    updatedAt: now.toISOString(),
    // Never nominal. See the note at the top: this cannot see what work is owed, and a green
    // light sourced from commit activity would be the same unfounded assurance it replaces.
    health: "on-demand",
    headline,
    metrics: {
      commitsLast30d: commits30d,
      uncommittedChanges: dirty,
      ...(daysSince !== null ? { daysSinceLastCommit: daysSince } : {}),
      ...(tasks.length ? { scheduledJobs: tasks.length, failingJobs: failing.length } : {}),
    },
    activity,
    // An empty list is the truth: a derived feed has no way to know what is owed. It is not a
    // claim that nothing is.
    todos: [],
    security: {
      state: "unknown",
      lastScanAt: null,
      scope: id,
      summary: "No security scan is wired to this project's status feed.",
      reportPath: null,
    },
  };
}

/** Write a derived status to <projectDir>/<relative>. Returns the path, or null if not derivable. */
export function writeDerivedStatus(projectDir, relative, options) {
  const status = deriveStatus(projectDir, options);
  if (!status) return null;
  const out = join(projectDir, relative);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(status, null, 2)}\n`);
  return out;
}
