# Organizing your projects for Company OS

You already accept this idea everywhere else. Vercel shows you which deployments are live and
which failed. Supabase shows you the database and who is querying it. Railway shows you which
services are up. You do not maintain those views by hand — you connected an account once, and the
platform enumerated itself.

Your own machine has no such view, and the reason is boring: nothing ever enumerated it. Company OS
is that enumeration. The manifest is the "connect your account" step, except the account is a
folder full of projects and you are the one who knows what they are.

This doc is about doing that step well. It answers three questions:

1. Which directories earn an entry (most do not)
2. What kind of thing each one is (there are about five)
3. What you must declare for that kind, and what you can skip

## First: this is a curation, not an inventory

The reference setup this tool was extracted from points at a root holding **116 directories** and
declares **9** of them. That ratio — under 10% — is the single most important number in this
document, because the instinct is to list everything and the result is a page nobody opens.

A directory earns an **engine** entry if you would want to be told when it breaks:

- it runs on a clock, or
- it listens on a port, or
- it holds state that something else reads, or
- you invoke it by hand often enough that you'd notice it missing.

A directory earns a **satellite** entry if you look at it but do not operate it: a deployed site, a
registry, an external dashboard, someone else's service.

Everything else is a folder. Experiments, archives, clones, that thing you tried in March. Leaving
them out is not an omission — it is the product.

If you cannot decide, apply the paging test: *if this stopped working on a Tuesday, would I want to
find out from a dashboard, or is it fine to discover it whenever I next open the folder?* Only the
first is an engine.

## The five kinds

These are not arbitrary. They fall out of what a dashboard can honestly measure, and each one maps
onto a hosted service you already understand.

| Kind | Like | What makes it this kind | The question it answers |
|---|---|---|---|
| **Scheduled pipeline** | Vercel Cron, GitHub Actions | Runs on a clock, produces dated output | Did last night's run succeed? |
| **Always-on service** | Railway, Render | Holds a port, should never be down | Is it up, and on which port? |
| **On-demand studio** | a CLI you run yourself | You invoke it; no clock | What are the commands, and which are real? |
| **Store** | Supabase, S3 | Others read from it; no pipeline of its own | What feeds it, and who consumes it? |
| **Satellite** | the deployed site | You watch it; you don't operate it | Where is it, and what is it? |

**Kinds compose, and pretending otherwise makes worse manifests.** In the reference setup one engine
is honestly labelled `Production studio + the store` — it is both a pipeline and the datastore other
engines read. Declare it as both: give it the pipeline's tasks *and* the store's ingress/egress. The
taxonomy is a checklist for what to declare, not a set of boxes to squeeze into.

You will also notice, once you write a few, that the `class` field is where the kind naturally
lands. That is fine and intended — `class` is free text precisely so it can carry your own
vocabulary. `Authoring brain`, `Production sub-engine (game art)`, `Service (publisher inbox)` are
all real examples. Consistency across entries matters more than matching the names above.

## What each kind must declare

Every engine needs the six required fields — `id`, `dir`, `name`, `class`, `accent`, `role`. Those
make the page build. What follows is what makes it *true*, per kind. Declare the marked fields or
that engine's most important signal stays dark.

### Scheduled pipeline

```jsonc
"nodes": [{
  "name": "collect",
  "desc": "Fetches every source in parallel, with a per-source timeout.",
  "cmd": "node scripts/collect.mjs --window 24h",
  "tasks": ["acme-collect-morning"]        // REQUIRED for this kind
}],
"logs": ["runs/{date}/shortlist.json"]     // where the evidence lands
```

`tasks` is the whole point. Without it the scheduler adapter runs, finds nothing to resolve, and
you get a page that describes a pipeline instead of measuring one. **If you declare only one
optional field on one engine in your entire manifest, make it this one.**

### Always-on service

```jsonc
"servers": [{ "port": 7803, "what": "inbox other engines POST to", "start": "npm start" }]
```

`port` is required for this kind. A service you cannot locate is a service you will rediscover by
grepping at 11pm. Put the *purpose* in `what`, not the technology — "inbox other engines POST to"
beats "express server."

### On-demand studio

```jsonc
"nodes": [{
  "name": "install art",
  "desc": "Manufactures and installs game art into the target repo. Verify by RENDER.",
  "cmd": "node scripts/install.mjs <game>"
}]
```

`nodes[].cmd` is required, and here is the part people miss: **for a project with no `package.json`,
the manifest is not a description of the command surface — it is the command surface.** Two of the
nine reference engines have no `package.json` at all and still declare three nodes each. Nothing
else on disk records how to run them. Declare nodes even when a project feels too informal for it;
that is exactly when the record is worth most.

### Store

```jsonc
"ingress": ["Artefacts and provenance records from Forge"],
"egress":  ["Query API on request"]
```

`ingress`/`egress` are required for this kind, because they *are* the store's operational
description — a datastore has no pipeline to show and no schedule to check. It also tends to have
few commands, so without these its page is nearly empty.

Set `hasOwnDashboard: true` if it already ships a real UI; Company OS will then write only a
command sheet beside it rather than a page that competes with it.

### Satellite

```jsonc
"satellites": [
  { "id": "docs-site", "name": "Documentation site",
    "note": "Public docs — deploys on push", "url": "https://example.com/docs" }
]
```

Satellites go in the `satellites` array, never in `engines`. This is the pressure valve for the
rat's nest: things you want listed but do not want measured. If you find yourself declaring an
engine with no nodes, no tasks, no ports and no store role, it is a satellite — move it and the
page gets more honest, not less complete.

## Two fields that deserve real thought

Everything above is mechanical. These two are not, and they are what makes the page worth opening.

**`role` — say what it is NOT.** The useful form is two clauses: what this project is responsible
for, and where its responsibility stops. *"Collects source material and ranks what's worth acting
on. Produces a shortlist and nothing else — deciding what to build with it belongs to Forge."* The
second clause is what stops you rebuilding the same capability in three projects. Roles in the
reference manifest run 150–250 characters; that is the right size. Longer becomes documentation
nobody reads, shorter becomes a label.

**`ingress`/`egress` — the contract.** These are how you see coupling you did not intend. When two
engines both claim to produce the same artefact, you have found a real problem, and you found it by
reading one page instead of two repos.

These are also the fields the `publish` projection emits, so if you ever want a public "what this
company does" page, they are the source. Write them for an internal reader anyway — the projection
drops anything path-shaped on the way out.

## Your manifest is done when declared tasks equal registered tasks

Setup otherwise has no finish line, which is why manifests get abandoned half-written. Here is one.

Ask your scheduler what is registered, and compare it to what your manifest declares. There are two
failure directions and they are not symmetrical:

- **Declared but not registered** is loud. The task resolves to nothing and the page shows it. This
  half fixes itself.
- **Registered but not declared** is silent, and it is the one that actually bites. The dashboard
  reports on a subset of your automation and looks exactly as confident as if it had them all.

In the reference setup, all 18 declared tasks are registered — but 27 matching tasks exist on the
machine. Nine real scheduled jobs are invisible to the dashboard, including a daily run and the
job that rebuilds the dashboard itself. That is a two-thirds-complete instrument presenting as a
complete one, which is the exact failure this project's `CONTRIBUTING.md` is organized around.

So: after your first build, list your registered tasks and walk the list. Every one either gets a
`tasks` entry on some node, or a conscious decision that it does not belong on the page.

## If you are having an agent do this

Most people will, and it works — a coding agent can read your `package.json` files and draft a
manifest that builds first try. Two boundaries are worth setting before you let it.

**It can verify structure. It cannot verify meaning.** `dir` exists or it does not. A task name is
registered or it is not. Ports are real. But `role`, `ingress` and `egress` are claims about intent
that cannot be checked against anything on disk — an agent reading empty script files will still
produce confident prose about what your projects do and how they relate to each other. That prose
will look identical to the prose you wrote yourself.

**So treat the first manifest as a set of candidates, not an answer.** This is the same pattern the
intranet feature uses for discovered pages: a scan proposes, a human promotes. Have the agent draft
every entry, then read the `role` lines yourself and correct the ones that are wrong. That review is
twenty minutes and it is the difference between a dashboard you trust and a dashboard that is
confidently wrong about your own company.

A good agent prompt for this: *"Read every subdirectory with a package.json. For each, propose a
manifest entry with id, dir, name, class and role, and tell me which kind from ORGANIZING.md it is
and why. Mark anything you inferred rather than read. Do not invent ingress/egress — leave them
empty and ask me."*

## The shortest possible start

Do not write the whole manifest. Write one engine — your most active pipeline — with its six
required fields plus `nodes` and `tasks`. Build it. Look at the page.

That one entry tells you whether this is worth the hour, and it tells you in about five minutes.
Add the rest when the page has already earned it.
