# Security policy

## Supported versions

Security fixes are applied to the latest version on the default branch.

## Reporting a vulnerability

Please do not open a public issue containing a real manifest, local paths, task names, or secrets. Use GitHub Private Vulnerability Reporting when it is enabled for this repository, or contact the maintainer through a private channel listed on the repository owner's profile. Include a reproduction built on the `examples/acme` fixture.

You should receive an acknowledgement within seven days.

## What this tool touches

Company OS reads your filesystem and writes static HTML. It makes no network requests, has no telemetry, and needs no account.

Specifically it reads: your manifest, each project's `package.json`, optional per-project status files, optional docs, and — via a scheduler adapter — your local task scheduler or crontab. It writes `index.html` at the configured output directory and one page per project.

**It only ever overwrites a file containing its own generated marker.** A hand-authored page in a project directory survives a build.

## Your manifest is private

A manifest holds ports, task names, local paths and command lines. Nothing in this repository contains one; the only manifests here are fictional.

If you configure a `publish` target, the projection is an **allowlist** — id, name, class, role, ingress, egress, and stage *names*. Never commands, ports, task names, paths or logs. Adding a field to your manifest cannot leak it; someone has to add it to the projection deliberately. Free-text `ingress`/`egress` entries are additionally dropped when they contain anything path-shaped, because internal prose routinely mentions real paths.

## Generated pages are files on disk

They get screenshotted, served over a local HTTP server, and can be committed. Treat the output as you would treat the manifest.

This is why panels have hard boundaries:

- **No secret value is ever written into a page.** The env panel reports counts and status. Key *names* are gated behind `showKeyNames`, off by default, because a name reveals which services you use.
- **Session titles are prompt text.** The sessions panel aggregates by default; `showTitles: true` writes recent prompt text into a static file, and the page says so when it is on.
- **No panel output can reach a `publish` target.**

Reveal, copy and edit of actual secret values is deliberately not in this tool. It links out to [enview](https://github.com/MrPickering/enView), a live localhost server that reads on demand and persists nothing.

## Optional integrations

Panels may read from `127.0.0.1` at build time (the sessions panel reads Session Index). No panel makes an external request. If you write your own panel, keep it that way — a static site generator reaching the internet at build time is a supply-chain surface nobody expects.
