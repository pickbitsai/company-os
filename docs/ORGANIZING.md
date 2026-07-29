# Organizing the manifest

Company OS reads one entry per project from `engines.json`. Writing the first entry takes five
minutes. Deciding *which* directories deserve one, and what each kind of project owes the
manifest, is the part that takes an hour — and it is the part that decides whether the dashboard
is worth looking at a month later.

This guide is about that hour.

## The rule for earning an entry

A directory earns an entry when **someone would go looking for its operational state**: what it
consumes, what it produces, what runs on a schedule, and where its logs are.

That is a narrower test than "is it a project". A vendored dependency, a scratch directory, and a
folder of exports are all projects in some sense and none of them earn an entry, because nobody
opens a dashboard to ask about them. Adding them costs more than it looks: every entry is a card
on the floor, and a floor of thirty cards where nine matter is harder to read than a floor of
nine.

The opposite failure is quieter. A directory with a scheduled job, or a server on a port someone
has to remember, that is *not* in the manifest is invisible — and invisible automation is how a
job fails for a month without anyone noticing.

**If it has a scheduled task, a bound port, or an unattended job, it earns an entry.** Everything
else is a judgment call, and the tiebreaker is whether you would want its health on the floor.

## Every entry owes six fields

`id`, `dir`, `name`, `class`, `accent`, `role` are required by the schema. Five are mechanical.
`role` is not, and it is the one people skimp on.

`role` should say what the project is *for*, in a sentence someone outside it can act on. Compare:

- ✗ "Handles asset generation." — true of half the company.
- ✓ "Manufactures and installs game art into the arcade game repos. Verify by RENDER: every engine
  silently fakes missing art."

The second tells a reader what to expect and what to distrust. `role` is the only prose the card
shows before someone clicks, so it carries the whole first impression.

## The five kinds, and what each one owes beyond the six

Most projects are one of these. A project can be two — a production engine that also serves a
dashboard is common — in which case it owes both lists.

### 1. Scheduled engine

Something runs unattended: a nightly job, a poller, a sweep.

**Owes: `nodes[]` with `tasks[]`.** The task names must match the scheduler exactly, because
Company OS resolves them live and reports a declared-but-unregistered task as missing. That check
is the entire value of declaring them — it is what catches a job that silently stopped existing.

**Also owes `logs[]`**, pointing at where a failed run leaves evidence. A scheduled engine with no
declared log is one you will debug by guessing.

Say what the job does when it *fails*, not just when it succeeds. "Commits mechanical fixes
locally; needs-human items go to the report" is worth more than "keeps things green".

### 2. Service

Something binds a port a human connects to: a dashboard, a viewer, a local API.

**Owes: `servers[]`** with `port`, `what`, and the exact `start` command. The port matters more
than it looks — a company accumulates local ports, two projects eventually pick the same one, and
whichever starts second loses silently. The manifest is the only place that collision is visible,
so record the port even for a server you start by hand twice a year.

### 3. Owns its own dashboard

The project already has a real control surface, better than a generated card.

**Owes: `hasOwnDashboard: true` and `dashboardNote`.** Company OS then leaves `index.html` alone
and writes a standalone command sheet beside it instead. The note should say where the real board
is and how to start it, because the whole point is redirecting a reader who landed in the wrong
place.

Without `hasOwnDashboard`, a build overwrites the hand-authored page. That is the single most
expensive mistake in this file.

### 4. Toolkit or library

Commands, no schedule, no port. Read by other projects or run by hand.

**Owes: `docs[]`, and `scriptNotes` where a command's name lies about what it does.** Company OS
reads `package.json` live, so the commands appear whether or not you describe them — which means
an unexplained `npm run sync` shows up looking safe. `scriptNotes` is where you say it writes.

`ingress`/`egress` matter most here: a library's contract *is* what it takes and returns.

### 5. Content or asset directory

Real material, no `package.json`: editions, exports, art, corpora.

**Owes: `logs[]` and `docs[]`, and honest `egress`.** There is no command surface to lean on, so
the entry is only as useful as its paths. Prefer a dated convention (`editions/{date}/`) over
naming today's directory — a hardcoded date is a link that rots on a schedule.

## Two fields worth more than they look

**`ingress` / `egress`.** Every dashboard eventually gets asked "who produces this, and who
consumes it". These two answer it. Write them as *artifacts*, not activities: "editions/{date}/
slate.json + AI receipts" beats "publishes the daily slate".

**`statusFile`.** Optional, and the only way a project reports its own health rather than having
it inferred. Without one, a station can say the scheduled job ran; it cannot say whether work is
owed. A project with a real backlog — open decisions, gaps, a queue — should publish one, and
should generate it from the data rather than typing the numbers, so it cannot quietly go stale.
See [`INTRANET.md`](INTRANET.md) for the surrounding subsystem.

## The finish line

A manifest is done when all of these are true. Until then it is half-written, which is worse than
empty, because a half-written manifest still renders a confident-looking floor.

- [ ] Every directory with a scheduled task, a bound port, or an unattended job has an entry.
- [ ] Every entry's `role` says what the project is for and what to distrust about it.
- [ ] Every declared task name resolves against the live scheduler — no "not registered" rows.
- [ ] Every path in `logs`, `docs`, `nodes[].cmd` and `servers[].start` exists. Check them; a dead
      path on a dashboard is read as truth far longer than a dead link in a README.
- [ ] No hardcoded dates where a convention would do.
- [ ] Every project that owns its `index.html` declares `hasOwnDashboard`.
- [ ] Projects that can report their own health publish a `statusFile`.

The third and fourth items are the ones that rot. They pass the day you write them and fail
quietly afterwards, so re-run them on a schedule rather than trusting the day-one result.
