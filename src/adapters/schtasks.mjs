// Windows Task Scheduler adapter.
//
// Reads the full CSV dump once and indexes it by task name, so a dashboard referencing 40 tasks
// costs one subprocess rather than 40. Task names are stored without the leading backslash that
// schtasks prefixes them with, because manifests name tasks the way you'd type them.

import childProcess from "node:child_process";

export const id = "schtasks";
export const platforms = ["win32"];

// "Repeat: Every" is only meaningful when the task repeats WITHIN its trigger. For a plain
// daily task schtasks fills it with "Disabled"; other locales/versions use "N/A" or "None".
const repeatEvery = (v) => {
  const s = (v || "").trim();
  return !s || /^(disabled|n\/?a|none)$/i.test(s) ? "" : `every ${s}`;
};

// Task Scheduler uses the successful HRESULT family 0x00041300 (decimal 267008+) for states
// that are not completed runs. They must not be collapsed into a boolean success: in particular,
// SCHED_S_TASK_RUNNING used to make consumers record an in-flight task as a clean exit. `ok`
// remains the backwards-compatible outcome field, but is now null when there is no completed
// outcome to report. Consumers that previously treated running/never-run as true will therefore
// see null; that intentional compatibility correction is the observation-honesty fix.
const SCHED_S_STATES = new Map([
  ["267008", { state: "ready", ok: null }],
  ["267009", { state: "running", ok: null }],
  ["267010", { state: "disabled", ok: null }],
  ["267011", { state: "never-ran", ok: null }],
  ["267012", { state: "no-more-runs", ok: null }],
  ["267013", { state: "not-scheduled", ok: null }],
  ["267014", { state: "failed", ok: false }],
  ["267015", { state: "invalid-trigger", ok: false }],
  ["267016", { state: "event-triggered", ok: null }],
]);

const outcomeFor = (rc) => {
  if (rc === "0") return { state: "completed", ok: true };
  return SCHED_S_STATES.get(rc) || { state: "failed", ok: false };
};

export function loadTasks() {
  const out = childProcess.execFileSync("schtasks", ["/query", "/fo", "CSV", "/v"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const rows = out.split(/\r?\n/).filter((l) => l.startsWith('"'));
  const tasks = new Map();
  let header = null;
  for (const line of rows) {
    const cells = line.slice(1, -1).split('","');
    if (cells[0] === "HostName") { header = cells; continue; }
    if (!header) continue;
    const rec = {};
    header.forEach((h, i) => { rec[h] = cells[i]; });
    const name = (rec.TaskName || "").replace(/^\\/, "");
    if (!name) continue;
    const rc = rec["Last Result"];
    const outcome = outcomeFor(rc);
    tasks.set(name, {
      name,
      next: rec["Next Run Time"] || "",
      last: rec["Last Run Time"] || "",
      rc,
      state: outcome.state,
      ok: outcome.ok,
      running: outcome.state === "running" || rec.Status === "Running",
      disabled: rec["Scheduled Task State"] === "Disabled",
      // schtasks reports absent fields as the literal strings "Disabled" / "N/A", both of
      // which are truthy — a plain `&&` guard rendered a daily task as "Daily · every
      // Disabled". Blank them explicitly, and trim: "Schedule Type" arrives padded ("Daily ").
      schedule: [rec["Schedule Type"], rec["Start Time"], repeatEvery(rec["Repeat: Every"])]
        .map((s) => (s || "").trim())
        .filter(Boolean)
        .join(" · "),
    });
  }
  return tasks;
}
