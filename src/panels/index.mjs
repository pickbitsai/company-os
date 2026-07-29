// Panels — optional cross-project views.
//
// A panel answers one question across every project at once: what secrets exist, what docs are
// missing, what sessions are open. Each is independent, each is off unless configured, and each
// degrades to nothing when the tool it depends on is absent. Same contract as scheduler
// adapters, for the same reason: a dashboard that half-works is more use than one that refuses
// to build because an optional tool is missing.
//
// A panel module exports:
//   id                       stable identifier, also the DOM id
//   title                    section heading
//   collect(ctx) -> data     may be async; throwing disables the panel with a warning
//   render(data, helpers)    -> HTML string, or "" to omit the section entirely
//   nav                      optional label for the top navigation
//   stat(data)               optional {label, value} for the hero stat row
//
// Panels receive the whole config and manifest, so they can key results to projects.
//
// PRIVACY: panels read genuinely sensitive material — env key names, session activity. They may
// surface names, counts and status. They must never surface values or transcript content, and
// panel output must never reach a publish target. `publicSnapshot` is a separate allowlist that
// knows nothing about panels, which is what enforces the second half.

const BUILTINS = {
  env: () => import("./env.mjs"),
  docs: () => import("./docs.mjs"),
  gtm: () => import("./gtm.mjs"),
  intranet: () => import("./intranet.mjs"),
  repos: () => import("./repos.mjs"),
  sessions: () => import("./sessions.mjs"),
  shape: () => import("./shape.mjs"),
};

export async function resolvePanel(name, settings) {
  if (settings && typeof settings.render === "function") return settings; // custom panel object
  const load = BUILTINS[name];
  if (!load) {
    throw new Error(`unknown panel "${name}" — expected one of ${Object.keys(BUILTINS).join(", ")}, or a panel object`);
  }
  return await load();
}

/**
 * Resolve, run and render every configured panel.
 *
 * A panel that throws during collect is reported and skipped — most often because its optional
 * dependency is not installed, which is a normal configuration, not a fault.
 */
export async function runPanels(ctx, { warn = console.warn } = {}) {
  const configured = Object.entries(ctx.config.panels || {})
    .filter(([, settings]) => settings && settings.enabled !== false);
  const results = [];

  for (const [name, settings] of configured) {
    let panel;
    try {
      panel = await resolvePanel(name, settings);
    } catch (error) {
      warn(`panel "${name}" not available: ${error.message}`);
      continue;
    }
    try {
      const data = await panel.collect({ ...ctx, settings });
      if (data == null) continue; // panel opted out — nothing to show, so show nothing
      results.push({ panel, data, settings });
    } catch (error) {
      warn(`panel "${panel.id || name}" skipped: ${error.message}`);
    }
  }
  return results;
}
