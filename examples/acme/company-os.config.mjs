// Example config for the fictional Acme company. Build it with:
//   npx company-os build --config examples/acme
//
// This is also the fixture the test suite renders, so it deliberately leaves the art and
// scheduler options off — proving the defaults (CSS-figure avatars, gradient backdrops, no
// schedule chips) produce a complete page with no assets and no platform dependency.

export default {
  root: ".",
  manifest: "./engines.json",
  // outDir defaults to root, and that is the right choice: generated pages sit next to the
  // projects they describe, so a station's link to a hand-authored dashboard (Atlas) resolves.
  // Pointing outDir somewhere else detaches the pages from those files.
  outDir: ".",

  brand: {
    name: "Acme Company OS",
    mark: "AC",
    kicker: "acme · virtual company",
    headline: "Four projects.<br>One living company.",
    blurb: "Every project has a face, a desk, and a place in the company. The floor is the friendly layer; live schedules, commands, and the real control surfaces sit underneath.",
    themeKey: "acme-company-theme",
    floorAria: "Acme virtual company floor",
    opsLabel: "Acme ops",
    engineKicker: "acme engine · operational dashboard",
    commandsKicker: "acme engine · command surface",
    pathPrefix: "acme/",
    manifestLabel: "examples/acme/engines.json",
    footData: "examples/acme/engines.json",
    rebuildHint: "npx company-os build --config examples/acme",
  },

  rebuildCommand: "npx company-os build --config examples/acme",

  // "none" keeps the example deterministic and platform-independent: a build on any machine
  // produces the same page. Switch to "schtasks" or "cron" (or omit for the platform default)
  // once your manifest names real scheduled tasks.
  scheduler: "none",

  // The docs panel needs nothing installed, so the demo shows it. Acme deliberately ships no
  // README or CLAUDE.md, which makes the gap report do something visible on a fresh clone.
  //
  // `env` and `sessions` are left off here: they read real secrets and real session logs, and an
  // example should never quietly scan the machine of whoever cloned it.
  panels: {
    docs: {},
    gtm: { file: "./portfolio-gtm.json" },
  },
};
