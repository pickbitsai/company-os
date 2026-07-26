# Rebuild this from scratch

Two ways to get a Company OS: `npm i @pickbitsai/company-os`, or hand the prompt below to your own coding agent and let it build one for you.

The second is genuinely worth doing. You'll get something shaped like your company rather than mine, and you'll understand it. The prompt is long because the interesting part isn't the feature list — it's the handful of decisions that separate a dashboard you trust from one you stop opening after a week. Those are marked **RULE**. Every one of them is there because it went wrong first.

Paste everything in the box into Claude Code, Codex, Cursor, or whatever you use, from the root of the folder that holds your projects.

---

```
Build me a "Company OS": a static HTML dashboard, generated from a manifest, that
gives me one page showing every project I'm running and what state it's in.

Context: I keep many projects in sibling directories under one root. I've lost
track of what can be run where, which scheduled jobs are healthy, and which
projects have documentation. I want one generated page that answers that, and I
want it regenerated on a schedule so it's never stale.

## Build this

A generator (plain Node, ESM, zero runtime dependencies) that reads:

1. A manifest JSON I maintain by hand: one entry per project with id, dir, name,
   a one-line class, an accent colour, a role paragraph saying what the project
   is responsible for AND what it deliberately is not, plus optional pipeline
   stages (name, description, the command that runs it, and any scheduled task
   names), long-running servers (port, what, start command), and doc paths.
2. Each project's package.json, for its npm scripts.
3. My actual task scheduler, for live job state.

...and writes index.html at the root plus one page per project.

## The parts, in order of how much they matter

### 1. Command surface, read live

For each project, read package.json scripts at build time and group them by
`namespace:` prefix (`build:`, `test:`, `deploy:`) in collapsible sections, each
command with a copy button. Show the underlying command beneath each one.

RULE: never let me hand-maintain this list. A hand-written list of commands is
wrong within a week and then actively misleading.

Now the part that makes it useful rather than just long. Mark which scripts are
actually load-bearing:
  - `wired`     — a pipeline stage or a server start command invokes it
  - `scheduled` — a scheduled task invokes it

RULE: detect BOTH forms. Some stages will say `npm run foo`; most scheduled jobs
invoke the file directly (`node scripts/foo.mjs`). If you only match `npm run`,
the `scheduled` mark will never fire on any project that schedules things the
normal way — you'll ship a badge that looks like a signal and is decoration.
Match the script BODY too: a stage whose command equals a script's body (possibly
plus arguments) is running that script.

RULE: make body matching one-directional. If a stage runs `node x.mjs`, that is
script `x`, NOT `x:check` whose body is `node x.mjs --check`. Otherwise one
scheduled job claims three scripts.

Flag scripts named deploy/ship/publish/migrate/reset/purge so the page never
reads as an invitation to paste a publish command without looking. Copy buttons
copy text; nothing in this dashboard executes anything, ever.

Skip `pre*`/`post*` scripts that shadow another script — npm runs those for me.
Skip keys starting with `_`: several of my package.json files use `scripts._note`
as documentation, and `npm run _note` would just fail. Render that text as a note
instead.

### 2. Live scheduler state, behind an adapter

Define one interface: `loadTasks() -> Map<taskName, {last, next, rc, ok, running,
disabled, schedule}>`. Ship an adapter for my platform (Windows Task Scheduler
via `schtasks /query /fo CSV /v`, or crontab), plus a "none" adapter. Choose the
default by platform. Wrap the call so a failing adapter warns and the dashboard
still builds without schedule chips.

RULE — and this is the one I care most about. **Absent data must render as
absent.**
  - cron records no exit code. Return `ok: null` and show a neutral "registered"
    chip. Do NOT show green. A green light for something nothing measured is
    worse than no light.
  - With the "none" adapter, declared tasks must read "declared in manifest", NOT
    "not registered". Nothing was read, so nothing can be reported missing.
  - Anywhere you sum a metric that isn't always present, track how many items
    actually reported. Show an em dash when none did, and `2k (5/47)` when it's
    partial. Summing absent-as-zero and printing the total is the single easiest
    way to make a dashboard lie.

Before you add any indicator, answer two questions: what input makes it fire,
and what does it show when the underlying thing was never measured? An indicator
that cannot fail isn't an indicator.

### 3. Never overwrite what you didn't generate

Every generated file starts with a marker comment. Only overwrite a file that
carries that marker, or doesn't exist. If a project already has a hand-built
index.html, leave it alone and write its command sheet to `ops-commands.html`
next to it instead, so its commands still live somewhere.

RULE: this is not optional politeness. Without it the first run silently
destroys someone's real dashboard.

### 4. A docs and agent-files gap report

Across all projects, check for README.md, CLAUDE.md, AGENTS.md, .env.example,
LICENSE, CONTRIBUTING.md, and count `.claude/skills/*/SKILL.md`.

Lead with what's MISSING, not a matrix: "3 projects have no README — [names]",
"4 have a .env but no .env.example". A grid of checkmarks reads as "fine" at a
glance even when four projects have no documentation.

Only flag `.env.example` where a `.env` actually exists. A finding I can't action
is noise, and noise is how a dashboard trains me to ignore it.

### 5. Optional panels

Same contract as the scheduler adapter: a panel is `collect()` + `render()`, off
unless I configure it, and inert (with a warning, not a crash) when the tool it
needs is absent.

RULE: resolve an optional dependency from MY config directory, not from the
package. A bare `import("pkg")` resolves relative to your own file and fails
whenever the package is symlinked — which is every monorepo and every `file:`
dependency.

RULE for anything touching secrets or prompts: a generated page is a file on
disk. It gets screenshotted, served, and committed. Render counts and status,
never values. Gate key NAMES behind an explicit opt-in — a name reveals which
services I use. If you surface AI session history, aggregate it: session titles
are derived from prompt text.

### 6. Config, not hardcoding

Every string, path, brand name, headline and schema id comes from a config file
resolved relative to itself. I should be able to point this at a different
company and get a different dashboard with no code changes.

## How to verify it

- Build it, then OPEN THE PAGE and look at it. Not the HTML — the rendered page.
  Serve it over http://127.0.0.1 and screenshot it if you're an agent without
  eyes on my screen. Assertions that the HTML contains a column will pass while
  the number in that column is meaningless. That is exactly how the three worst
  bugs in this design shipped.
- Cross-check every count against ground truth: the number of scripts the page
  claims must equal `Object.keys(require('<project>/package.json').scripts).length`
  minus what you deliberately filtered.
- Prove each indicator can fail. Feed it an input that should trip it and confirm
  it trips. If you can't construct that input, delete the indicator.
- Run it twice and diff the output. Only timestamps should change.

## Style

Dark, dense, monospace accents, one accent colour per project driving its card.
Collapsible sections. No framework, no build step, no external requests, no fonts
or scripts from a CDN — one self-contained HTML file per page.

Ask me for my project list and my platform before you start, then show me the
manifest schema you're proposing before you build the renderer.
```

---

## Why the RULEs are in there

Four of them exist because the original shipped the bug first:

| What shipped | Why it was wrong |
|---|---|
| A `scheduled` badge matching only `npm run x` | Every scheduled job invoked `node x.mjs` directly, so no input could ever make the badge appear. |
| `scheduler: "none"` warning "not registered" on every task | Nothing was read, so nothing could be missing. It manufactured a problem out of an absent measurement. |
| A Messages column showing `0` | The count was absent on 64 of 80 sessions. "0 messages" asserts *nothing happened here* — stronger and wronger than *not measured*. |
| A sum shown as a complete total | It was built from 5 of 47 items. |

All four passed their tests. Two were only caught by rendering the page and looking at it.

The fifth — never overwriting a file you didn't generate — is the one that would have cost real work rather than credibility.
