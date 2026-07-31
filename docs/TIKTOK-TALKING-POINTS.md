# Company OS — TikTok talking points

Read-aloud notes, not a script. Short sentences, contractions, breath-friendly.

Three links to give them: the repo, `docs/REBUILD-PROMPT.md`, and the install.

> **Check this before you record.** `@pickbitsai/company-os` is live on npm, so
> `npm i -D @pickbitsai/company-os` works on camera — say it, show it.
>
> One thing to get right: the package is `@pickbitsai/company-os`, the command it installs is
> **`pickbits-os`**. The unscoped `company-os` is an unrelated project, which is why ours carries
> the prefix. Say and show `pickbits-os` — viewers type what they hear.

---

## The hook (first 3 seconds)

Lead with the problem, not the tool. Pick whichever is truest on the day:

> "I've got nine projects and about a hundred and eighty npm scripts. Last week I couldn't tell you which ones actually run."

> "I asked myself a simple question: which of these commands does my company actually use? I couldn't answer it. So I built the thing that answers it."

> "This is every project I'm running, on one page, generated from a file."

Avoid opening with "I built a dashboard." Everyone's built a dashboard.

## The turn — why this isn't just a homepage

This is the beat that makes it worth watching. Say it plainly:

> "It reads your package.json files at build time. So the command list can't go stale — it *is* your package.json."

> "But here's the part I care about. It marks which scripts are actually wired into something. Out of forty-four in one project, seven do anything. The other thirty-seven just exist."

That number is the whole video. **Real from theoretical** is the idea people remember.

## Demo beats, in order

1. **The floor.** One card per project. Colour-coded, health at a glance.
2. **Commands.** Open one project. Grouped by namespace, copy buttons, and the `wired` / `scheduled` badges.
3. **Schedules.** Live state from Task Scheduler or cron — last run, next run, exit code.
4. **The gap report.** "Three of my projects have no README. Four have a `.env` and no `.env.example`. I did not know that."
5. **Project shape.** What each project actually *is* — an agentic engine, a CLI, a library, a game — and whether it's still one thing. "This one isn't a project. It's a directory with forty-one loose files and no README. The dashboard said so before I did."
6. **Sessions** *(if the plugin's installed).* Where your Claude and Codex sessions actually ran. "Fifty-three of my last eighty sessions were in one project. I thought I was working on games."
7. **Env vault** *(if installed).* Status only on the dashboard, then click through to the manager. Say the boundary out loud — see below.

Keep 4, 5 and 6 in. They're the ones that get "wait, I need that" comments, because they tell you something about yourself.

On beat 5, the detail worth saying out loud — it's the trust move in miniature:

> "It never just says 'your project is messy.' It shows the reason it thinks so, and how sure it is. If you disagree, you can look at the evidence and tell it it's wrong."

## The line that builds trust

Worth 5 seconds of the runtime:

> "No secret values ever get written into the page. The dashboard is a file on disk — it gets screenshotted and committed. So it shows you counts and status, and hands off to a local tool when you actually need a value."

Then, if you want the sharper version:

> "It found six env files sitting in my git history. Private repos, so not a fire — but `.gitignore` doesn't retract what's already committed."

## The honesty angle — your differentiator

This is the most *you* thing about the project and nobody else's dashboard says it. Pick one:

> "If a scheduled job reports no exit code, it doesn't show green. It shows 'registered'. A green light for something nothing measured is worse than no light."

> "I shipped a badge that no input could ever produce. It looked like a signal for a week. Now the rule is: if you can't make an indicator fire on purpose, delete it."

> "One column was showing zero messages for projects with four sessions in them. It wasn't zero — the data was missing. 'Zero' says nothing happened. That's a stronger claim, and it was false."

## The close — two ways in

> "Two ways to get one. Install it — it's MIT, no telemetry, nothing leaves your machine. Or take the prompt in the repo, hand it to your own agent, and build your own. The prompt carries the design rules *and* the four bugs that taught me them."

> "Link's in the bio. It's free. Tell me what it finds in your setup."

That last line is the comment-bait: people will reply with their own gap counts.

---

## Numbers to have on hand

Use your real ones on the day — check the dashboard before recording. Roughly, from this machine:

| | |
|---|---|
| Projects | 9 engines, 15 games |
| npm scripts read live | ~180 |
| Of newsroom's 43, actually wired | 7 |
| Scheduled jobs tracked | 18 |
| Doc gaps found | 14 |
| Env files found | 40 |
| Env files in git history | 6 |
| Agent sessions grouped | 80 across 16 projects |

## Not shipped yet — don't claim this on camera

Written up now so it's ready, but **this lives in the private ops repo, not in the package.**
Nothing below is a Company OS feature until `pickbits-os check` exists. If you say it before then,
someone installs it and it isn't there.

The story, when it does ship — it's the strongest honesty-angle material we have, because the
tool caught the person who built it:

> "The manifest already said which port every service owns. Turns out four of them were sitting on
> a port that belonged to something else. Three were running while I was looking at it."

> "Here's my favourite part. The first version of the checker flagged a *comment* — a note I'd
> written saying 'this port belongs to warehouse.' It also flagged a screen size and a timeout.
> One in three findings was garbage. A checker that cries wolf is worse than no checker, so it
> now reads code, not text that looks like code."

> "Then it found a bug in my own edit. I added a service to the manifest and it vanished — the
> file had the same key twice, and JSON keeps the last one. It parsed fine. It rendered fine. It
> just quietly wasn't there. Now that's an error."

The rule underneath all three, and the thing to actually say:

> "If I can't make a check fail on purpose, I don't trust it. Every one of these has a test that
> proves it can go red."

What it deliberately does *not* report: eight of my projects bind port 3000. That's not a
conflict — they never run at the same time. Flagging it would be how the tool becomes noise you
learn to scroll past.

(That number was 18 the first time I counted, because the bad matcher was counting comments and
strings. The corrected count is 8. If you want a laugh on camera: the number I nearly used to
illustrate false positives was itself a false positive.)

**Ship gate:** move the checker into the package as `pickbits-os check`, then this section merges
up into "Demo beats" and "The honesty angle."

## Don't say

- **"Secure"** or "it protects your secrets." It *inventories* them. The dashboard deliberately holds none.
- **"AI-powered."** Nothing in the generator calls a model. It reads files. That's the point, and claiming otherwise invites the obvious question.
- **"Replaces"** anything. It doesn't replace gitleaks or TruffleHog — say it complements them if secret scanning comes up.
- Any real key name, path, or repo name that isn't already public. Blur or use the Acme example if you're showing the env panel.
- **"company-os"** as the command. It's `pickbits-os`. The unscoped name is someone else's package, and viewers type what they hear.

## Before you hit record

- Run your local Company OS build so the numbers are current.
- Decide whether the env panel is on screen at all. If it is, check the frame for project names you'd rather not publish.
- The Acme example is the safe thing to demo — fictional company, no real data, and it's what a viewer sees on their first run anyway. From a clone:

  ```bash
  node bin/pickbits-os.mjs build --config examples/acme
  ```

  If the command is on screen, check it reads `pickbits-os`, never `company-os`.
