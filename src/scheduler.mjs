// Scheduler adapter resolution.
//
// An adapter is any module exporting `loadTasks() -> Map<name, taskState>`. Config may name a
// built-in ("schtasks" | "cron" | "none"), or pass an object/function directly for a scheduler
// this repo has never heard of (GitHub Actions, Airflow, a queue you wrote).

import { platform } from "node:process";

const BUILTINS = {
  schtasks: () => import("./adapters/schtasks.mjs"),
  cron: () => import("./adapters/cron.mjs"),
  none: () => import("./adapters/none.mjs"),
};

export function defaultScheduler() {
  return platform === "win32" ? "schtasks" : "cron";
}

export async function resolveScheduler(spec) {
  const choice = spec ?? defaultScheduler();

  if (typeof choice === "function") return { id: "custom", loadTasks: choice };
  if (choice && typeof choice === "object" && typeof choice.loadTasks === "function") {
    return { id: choice.id || "custom", loadTasks: choice.loadTasks };
  }
  const load = BUILTINS[choice];
  if (!load) {
    throw new Error(
      `unknown scheduler ${JSON.stringify(choice)} — expected one of ${Object.keys(BUILTINS).join(", ")}, ` +
      `or an object/function exporting loadTasks()`
    );
  }
  return await load();
}

// Adapters talk to the outside world, so any of them can fail on a machine that lacks the tool.
// A failure degrades the dashboard to "no live schedule state" with a warning — it never stops
// the build, because the rest of the page is still worth having.
export async function loadTasksSafely(spec) {
  const adapter = await resolveScheduler(spec);
  try {
    const tasks = adapter.loadTasks();
    return { id: adapter.id, tasks: tasks instanceof Map ? tasks : new Map(Object.entries(tasks || {})) };
  } catch (error) {
    console.warn(`scheduler "${adapter.id}" unavailable: ${error.message}`);
    return { id: adapter.id, tasks: new Map(), failed: true };
  }
}
