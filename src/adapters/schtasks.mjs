// Windows Task Scheduler adapter.
//
// Reads the full CSV dump once and indexes it by task name, so a dashboard referencing 40 tasks
// costs one subprocess rather than 40. Task names are stored without the leading backslash that
// schtasks prefixes them with, because manifests name tasks the way you'd type them.

import { execFileSync } from "node:child_process";

export const id = "schtasks";
export const platforms = ["win32"];

export function loadTasks() {
  const out = execFileSync("schtasks", ["/query", "/fo", "CSV", "/v"], {
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
    tasks.set(name, {
      name,
      next: rec["Next Run Time"] || "",
      last: rec["Last Run Time"] || "",
      rc,
      // 267009 = currently running, 267011 = has not run yet. Neither is a failure.
      ok: rc === "0" || rc === "267009" || rc === "267011",
      running: rec.Status === "Running",
      disabled: rec["Scheduled Task State"] === "Disabled",
      schedule: [rec["Schedule Type"], rec["Start Time"], rec["Repeat: Every"] && `every ${rec["Repeat: Every"]}`]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return tasks;
}
