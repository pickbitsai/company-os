# Company OS

**A local ops dashboard for people running many projects with AI agents.** Point it at a manifest of your projects and it generates a static company floor: what each project is, the commands it can actually run, which of those are load-bearing, and the live state of anything you've scheduled.

Runs on your machine. Reads your files. Writes static HTML. No telemetry, no account, no uploads, no dependencies.

```bash
npm i -D github:pickbitsai/company-os
npx company-os init          # writes a starter config + empty manifest
npx company-os build         # writes index.html + one page per project
```

GitHub is the immediate distribution channel for this release. The equivalent
registry package will be `@pickbitsai/company-os` after npm publication.

> **Always install first, or name the repo explicitly.** An unrelated package
> called `company-os` exists on npm and ships a binary of the same name, so a
> bare `npx company-os` on a machine that hasn't installed this one will fetch
> and run *that* instead. The `npx` lines above are safe because they follow the
> install on line 1 and resolve to your local `node_modules/.bin`.

Try it before configuring anything — this form needs no install and cannot
resolve to the wrong package:

```bash
npx github:pickbitsai/company-os build --config examples/acme
```

## Why this exists

This is extracted from the dashboard I use to run my own work: nine projects, ~180 npm scripts, 18 scheduled jobs, several long-running local servers. The problem it solves is not "I need a pretty homepage" — it's that **I could no longer answer basic questions about my own machine.** Which of these 44 scripts does anything real? Did last night's job run? What does this project consume, and what is it allowed to produce?

Those answers already existed, scattered across `package.json` files, Task Scheduler, and my memory. Company OS collects them into one page and regenerates it on a timer.

## What it does

**Reads your command surface, live.** Each project's `package.json` scripts are read at build time and grouped by `namespace:` prefix. Nothing is hand-maintained, so the list cannot drift from reality.

**Separates real from theoretical.** A script is marked `wired` when a pipeline stage or server actually invokes it, and `scheduled` when a scheduled task does. This is the part worth having: it distinguishes the 7 commands your company runs from the 37 that merely exist. Detection matches both `npm run foo` and the underlying command (`node scripts/foo.mjs`), because most scheduled jobs invoke the file directly.

**Flags commands that leave the building.** Anything named `deploy`, `ship`, `publish`, `migrate`, `reset`… is marked. Copy buttons copy text — nothing here executes anything, ever.

**Shows live schedule state.** A scheduler adapter resolves each declared task's last run, next run, and exit code. Ships with Windows Task Scheduler and crontab; bring your own for anything else.

**Refuses to clobber your work.** The generator only overwrites files carrying its own generated marker. A hand-authored dashboard in a project directory survives — and gets a separate `ops-commands.html` so its commands still appear somewhere.

## Configuration

`company-os.config.mjs`, resolved relative to itself:

```js
export default {
  root: ".",                        // your projects live here; every engine "dir" is relative to this
  manifest: "./engines.json",
  outDir: ".",                      // default: root, so pages sit next to what they describe

  brand: {
    name: "Acme Company OS",
    mark: "AC",
    headline: "Four projects.<br>One living company.",
  },

  scheduler: "cron",                // "schtasks" | "cron" | "none" | your own adapter
  avatars: "./assets/avatars",      // optional <engineId>.webp mascots; omit for CSS figures
  backdrops: { storybook: "./assets/floor.png" },  // optional; omit for CSS gradients

  governance: "./governance.json",  // optional
  requireGovernance: false,         // true = a missing profile or unpinned model fails the build
};
```

The manifest is one entry per project. See [`schemas/engines.schema.json`](schemas/engines.schema.json) for every field, and [`examples/acme/engines.json`](examples/acme/engines.json) for a worked example that exercises all of them.

```jsonc
{
  "engines": [{
    "id": "signal",
    "dir": "packages/signal",
    "name": "Signal",
    "class": "Research + ranking",
    "accent": "#00f4ff",
    "role": "Collects source material and ranks what's worth acting on. Produces a shortlist and nothing else.",
    "ingress": ["Public RSS and API feeds (28 sources)"],
    "egress": ["A ranked shortlist per run"],
    "nodes": [{
      "name": "collect",
      "desc": "Fetches every source in parallel, with a per-source timeout.",
      "cmd": "node scripts/collect.mjs --window 24h",
      "tasks": ["acme-collect-morning"]     // resolved live against your scheduler
    }],
    "servers": [{ "port": 7801, "what": "shortlist viewer", "start": "npm run viewer" }]
  }]
}
```

## Scheduler adapters

| Adapter | Platform | Reports |
|---|---|---|
| `schtasks` | Windows | last run, next run, exit code, running, disabled |
| `cron` | macOS / Linux | next run — cron records no outcome |
| `none` | any | nothing; the dashboard becomes a pure manifest view |

Omit `scheduler` and the platform default is used. `cron` needs a name, since cron has none — add a marker:

```cron
0 6 * * *  node scripts/collect.mjs   # company-os: acme-collect-morning
```

Anything else — GitHub Actions, Airflow, a queue you wrote — is a function:

```js
scheduler: {
  id: "actions",
  loadTasks: () => new Map([["nightly", { name: "nightly", ok: true, last: "…", next: "…", schedule: "daily 06:00" }]]),
}
```

**On honesty about state.** cron reports no exit code, so its adapter returns `ok: null` and the page shows a neutral *registered* chip — never a green pass for something nothing measured. With `scheduler: "none"`, declared tasks read *declared in manifest*, not *not registered*: nothing was read, so nothing can be missing. An indicator that cannot fail isn't an indicator, and a green light for an unmeasured thing is worse than no light.

## Panels — the cross-project views

Panels answer one question across every project at once. Each is off unless configured, and each degrades to nothing when the tool it needs is absent — the same contract as scheduler adapters, for the same reason: a dashboard that half-works beats one that refuses to build because an optional tool isn't installed.

```js
panels: {
  docs: {},                                          // no dependencies
  env: { roots: ["."], showKeyNames: false },        // needs: npm i enview
  sessions: { url: "http://127.0.0.1:4173" },        // needs: Session Index running
}
```

| Panel | Needs | Answers |
|---|---|---|
| `docs` | nothing | Which projects have no README, no `CLAUDE.md`, no `AGENTS.md`, or a `.env` with no `.env.example` |
| `env` | [`enview`](https://github.com/pickbitsai/enView) ≥ 0.2.0 | Where every `.env` lives, how many credential-shaped keys it holds, whether it's encrypted, and whether git is tracking it |
| `sessions` | [Session Index](https://github.com/pickbitsai/session-index) on localhost | Which projects your Claude and Codex sessions actually ran in, and what's worth picking back up |

Panels lead with **what's wrong**, not an inventory. A grid of checkmarks reads as "fine" at a glance even when four projects have no documentation; `⚠ 3 projects have no README` does not.

### What panels will not show you

These read genuinely sensitive material, so the boundaries are deliberate and worth knowing:

- **Secret values are never read into the page.** enview reads values only to classify them (encrypted? placeholder? credential-shaped name?) and discards them. What reaches the panel is names, counts and status. Key *names* are further gated behind `showKeyNames: true`, because a name still tells a reader which services you use.
- **Session titles are prompt text.** `title` and `about` are derived from the words you typed, so the panel renders aggregates by default — counts, agent split, last activity. `showTitles: true` writes recent prompt text into a static HTML file on disk; the panel says so on the page when it's on.
- **No panel output can reach a `publish` target.** The public projection is a separate allowlist that has no knowledge of panels.

### Writing your own

A panel is a module with `collect()` and `render()`:

```js
panels: {
  deploys: {
    id: "deploys",
    title: "Recent deploys",
    collect: async ({ config, manifest }) => fetchDeploys(manifest),
    render: (data, { esc }) => `<details class="ops-section" id="deploys">…</details>`,
    stat: (data) => ({ label: "deploys today", value: data.today }),
    nav: "Deploys",
  },
}
```

`collect` may be async and may throw — a throw disables that panel with a warning and never fails the build.

## Publishing a safe subset

If a public site should show what your company does without exposing how it runs, declare a `publish` target. The projection is an **allowlist** — id, name, class, role, ingress, egress, and stage *names*. Never commands, ports, task names, paths, or logs. Adding a field to your manifest cannot leak it; someone has to add it to the projection on purpose. Free-text `ingress`/`egress` entries are additionally dropped if they contain anything path-shaped, because internal prose mentions real paths.

```js
publish: [{ dir: "../website/data", globalName: "COMPANY_OS" }],
```

Then `npx company-os build --sites-only` refreshes just those.

## What's private, and how that's enforced

This repo contains no manifest but the fictional one. `npm run leakscan` scans everything in the `files` allowlist for absolute paths, credentials, literal private schema ids, and — if a real manifest happens to be on the machine — that manifest's own ports and task names. It runs on `prepublishOnly`, so a publish cannot skip it.

```bash
npm test         # 37 tests; builds the Acme example and asserts on the output
npm run test:consumer # packs, installs, and runs the CLI as a clean consumer
npm run leakscan
npm run preflight  # leakscan + tests + clean-consumer install
```

## Design notes

A few decisions that look like details and aren't:

- **The command list is read, never declared.** A hand-maintained list of commands is wrong within a week.
- **`_note` entries are prose, not commands.** Several projects use a `scripts._note` key as documentation. Rendering `npm run _note` with a copy button would offer you a command that fails, so the text is shown as a note instead.
- **`pre*`/`post*` wrappers are hidden** when they shadow another script — npm runs them for you.
- **Absent data is shown as absent.** See the scheduler note above. This is the rule the whole dashboard is judged by: it is an instrument, and an instrument that reads plausibly when it measured nothing is broken.

## License

MIT © PickBits.AI
