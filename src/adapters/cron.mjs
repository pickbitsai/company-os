// crontab adapter (macOS / Linux).
//
// Naming: cron has no concept of a task name, so entries opt in with a trailing marker —
//   0 6 * * *  node scripts/canvass.mjs   # company-os: canvass-morning
// Entries without a marker are ignored rather than guessed at, so a manifest task name either
// resolves to exactly one crontab line or is reported as "not registered".
//
// Honesty note: cron records no last-run time and no exit code. This adapter therefore returns
// `ok: null` rather than `ok: true` — the renderer shows a neutral "registered" chip instead of
// a green pass. A green light nothing measured is worse than no light.

import { execFileSync } from "node:child_process";

export const id = "cron";
export const platforms = ["darwin", "linux", "freebsd", "openbsd"];

const MACROS = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *", "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

// Expand one cron field ("*", "5", "1,3", "1-5", "*/15", "1-30/5") into a Set of allowed values.
function expandField(field, min, max) {
  const allowed = new Set();
  for (const part of String(field).split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) return null;
    let lo, hi;
    if (range === "*") { lo = min; hi = max; }
    else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      lo = a; hi = b;
    } else { lo = hi = Number(range); }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return allowed.size ? allowed : null;
}

function parseSchedule(expr) {
  const normalized = MACROS[expr.trim()] || expr;
  const f = normalized.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const minute = expandField(f[0], 0, 59);
  const hour = expandField(f[1], 0, 23);
  const dom = expandField(f[2], 1, 31);
  const month = expandField(f[3], 1, 12);
  // Both 0 and 7 mean Sunday.
  const dowRaw = expandField(f[4], 0, 7);
  if (!minute || !hour || !dom || !month || !dowRaw) return null;
  const dow = new Set([...dowRaw].map((d) => (d === 7 ? 0 : d)));
  const domRestricted = f[2] !== "*";
  const dowRestricted = f[4] !== "*";
  return { minute, hour, dom, month, dow, domRestricted, dowRestricted };
}

// Walk forward a minute at a time. Bounded at ~400 days so an unsatisfiable expression
// (e.g. Feb 30) terminates instead of spinning.
function nextRun(parsed, from = new Date()) {
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  for (let i = 0; i < 400 * 24 * 60; i++) {
    if (parsed.month.has(t.getMonth() + 1) && parsed.hour.has(t.getHours()) && parsed.minute.has(t.getMinutes())) {
      const dayOk = parsed.domRestricted && parsed.dowRestricted
        // cron ORs day-of-month with day-of-week when both are restricted.
        ? parsed.dom.has(t.getDate()) || parsed.dow.has(t.getDay())
        : parsed.dom.has(t.getDate()) && parsed.dow.has(t.getDay());
      if (dayOk) return t;
    }
    t.setMinutes(t.getMinutes() + 1);
  }
  return null;
}

export function loadTasks() {
  let out;
  try {
    out = execFileSync("crontab", ["-l"], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    // `crontab -l` exits non-zero when the user simply has no crontab. That is not an error.
    if (/no crontab/i.test(error.stderr || error.message || "")) return new Map();
    throw error;
  }

  const tasks = new Map();
  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const marker = trimmed.match(/#\s*company-os:\s*(.+?)\s*$/i);
    if (!marker) continue;
    const name = marker[1];
    const body = trimmed.slice(0, marker.index).trim();
    const expr = body.startsWith("@")
      ? body.split(/\s+/)[0]
      : body.split(/\s+/).slice(0, 5).join(" ");
    const parsed = parseSchedule(expr);
    const next = parsed ? nextRun(parsed) : null;
    tasks.set(name, {
      name,
      next: next ? next.toISOString().replace("T", " ").slice(0, 16) : "",
      last: "",
      rc: null,
      ok: null,        // cron reports no outcome — see the note at the top of this file.
      running: false,
      disabled: false,
      schedule: parsed ? expr : `${expr} (unparsed)`,
    });
  }
  return tasks;
}
