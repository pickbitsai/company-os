// No-scheduler adapter. The dashboard renders as a pure manifest view: engines, commands, docs
// and links, with no schedule chips and no "not registered" warnings.
//
// This is the right choice when your jobs live somewhere this tool can't see (GitHub Actions,
// Airflow, a CI server) — better an absent section than an empty one implying nothing is set up.

export const id = "none";
export const platforms = [];

export function loadTasks() {
  return new Map();
}
