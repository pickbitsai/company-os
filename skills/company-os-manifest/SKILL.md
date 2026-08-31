---
name: company-os-manifest
description: Draft or extend a Company OS manifest for a folder of projects. Use when asked to set up Company OS, add projects to engines.json, decide which directories belong on the dashboard, or classify a project's kind. Produces reviewable candidates, never finished claims.
---

# Draft a Company OS manifest

Read `docs/ORGANIZING.md` in the Company OS package before starting. It is the source of truth for
this method; this skill is the operating procedure.

Your output is a set of **candidates for review**, not an answer. Structure you can verify. Meaning
you cannot.

## Read the current truth

1. List every directory under the configured `root`. Do not recurse into projects.
2. For each, read `package.json` scripts if present, plus `README.md`, `CLAUDE.md`, `AGENTS.md`.
3. Ask the scheduler what is registered (`schtasks /query /fo CSV /v`, or `crontab -l`).
4. Note which directories contain no source and no docs. You will be tempted to describe them
   anyway. Do not.

## Curate — most directories do not belong

A directory earns an **engine** entry only if you would want to be told when it breaks: it runs on
a clock, holds a port, holds state something else reads, or is invoked often enough to be missed.

A directory earns a **satellite** entry if it is watched but not operated — a deployed site, a
registry, an external dashboard.

Everything else is omitted. Archives, backups, clones, experiments and temp directories are not
projects. The reference setup declares 9 of 116 directories. If your ratio is far higher, you are
building an inventory, and an inventory is the failure mode.

## Classify — five kinds

| Kind | Signal | Minimum it must declare |
|---|---|---|
| Scheduled pipeline | runs on a clock | `nodes[].tasks` |
| Always-on service | holds a port | `servers[].port` |
| On-demand studio | invoked by hand | `nodes[].cmd` |
| Store | others read from it | `ingress` / `egress` |
| Satellite | watched, not operated | goes in `satellites`, not `engines` |

Kinds compose. A production studio that is also the datastore declares both sets. Put the kind in
`class` using the project's own vocabulary.

If a project has no `package.json`, the manifest entry **is** its command surface — declare its
nodes anyway. That is when the record is worth most.

## Declare only what you can support

Every engine needs `id`, `dir`, `name`, `class`, `accent`, `role`, plus its kind's minimum.

- **Never invent `tasks`.** Use only names the scheduler actually reported. A fabricated task
  resolves to nothing and turns a live instrument into decoration.
- **Never invent `ingress` / `egress`.** Nothing on disk records what feeds or reads a project. Omit
  them, or write an explicit `NOT YET DECLARED — <what is missing>` so the gap appears on the page
  rather than disappearing.
- **`role` is always a claim.** Two clauses: what the project is responsible for, and where that
  responsibility stops. 150–250 characters. Mark it when it came from script names rather than from
  code or docs you actually read.
- **Ports must be read**, from a start command or config — never guessed.

## Check the finish line

Compare declared task names against registered ones. Two failure directions, only one of them loud:

- Declared but not registered — visible on the page; self-correcting.
- **Registered but not declared** — silent, and the dangerous one. The dashboard reports on a subset
  of the user's automation while looking exactly as confident as if it had all of it.

List every registered task with no manifest entry. Each one needs either a `tasks` entry or a
deliberate decision to leave it off.

## Hand off

Build once, then report: what you included, what you omitted and on what basis, and — separately
and explicitly — which fields you verified from disk versus inferred. Name your three weakest
claims and ask for those specifically.

Do not register scheduled tasks, add a `publish` target, or install optional panel dependencies.
Those are the user's decisions.
