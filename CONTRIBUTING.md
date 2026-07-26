# Contributing

```bash
git clone https://github.com/pickbitsai/company-os.git
cd company-os
npm install
npm test                                    # 22 tests, builds the Acme example
npm run demo                                # render examples/acme
npm run preflight                           # leakscan + tests
```

There are no runtime dependencies and there should not be any. This generates static HTML from JSON; anything that needs a package probably belongs in a panel behind an optional peer.

## The rule the whole project is judged by

**Absent data is shown as absent.** This is a dashboard someone will act on, so a number that looks measured and is not is worse than no number.

Three bugs of exactly this shape have already shipped and been fixed here:

- A `scheduled` badge that no input could produce, because detection only matched `npm run x` while every scheduled job invoked `node x.mjs` directly. A badge that cannot appear reads like a signal and is decoration.
- `scheduler: "none"` reporting every declared task as **"not registered"**. Nothing was read, so nothing could be missing. It now reads *declared in manifest*.
- A Messages column showing **0** where the scanner reported no count. For a project with four sessions, "0 messages" asserts *nothing happened here* — a stronger and wronger claim than *not measured*. It now shows an em dash, or the sum with its coverage (`2k (5/47)`).

If you add an indicator, be able to answer: what input makes it fire, and what does it show when the underlying thing was never measured? A test that only asserts the column exists will pass while the number in it is meaningless — all three of the above did.

## Never overwrite what you did not generate

`safeWrite` only writes files carrying the configured generated mark. A hand-authored dashboard in someone's project directory must survive a build that did not expect it, and a project marked `hasOwnDashboard` gets a separate `ops-commands.html` instead. There is a test for this; do not route around it.

## Nothing private in the publish set

`npm run leakscan` scans everything in the `files` allowlist for absolute paths, credentials, and — if a real manifest happens to be on the machine — that manifest's own ports and task names. It runs on `prepublishOnly` and in CI.

Publish by allowlist (`files` in package.json), never by `.npmignore` subtraction. Generated example output is stripped on `prepack`, by generated marker rather than by filename, so the hand-authored Atlas fixture survives.

## Panels

A panel is `collect()` plus `render()`, off unless configured, and inert when the tool it needs is absent — `collect` may throw and that disables the panel with a warning rather than failing the build.

Panels read sensitive material, so:

- Never render a secret value, and gate key *names* behind an explicit opt-in — a name still reveals which services someone uses.
- Session titles are prompt text. Aggregate by default.
- Resolve an optional dependency from the **consumer's** directory. A bare `import("pkg")` resolves relative to this package and fails whenever it is symlinked, which is every monorepo and every `file:` dependency.
- Panel output must never reach a `publish` target. The public projection is a separate allowlist that knows nothing about panels — keep it that way.

## Verifying a change to the renderer

Diff the output. Generate into a temp `outDir`, compare against the previous build, and normalise only the timestamps. That is how the original single-file extraction was proven to change nothing across ten pages, and it catches far more than reading the diff of the generator does.

And **look at the page**. Two of the three honesty bugs above passed their HTML assertions and their stat counts. Rendering it was the only thing that found them.
