// Page renderers.
//
// `createRenderer(ctx)` closes over everything the pages need, so each render function keeps the
// shape it had as a top-level function in the original single-file generator. That similarity is
// deliberate: it makes the extraction reviewable by diffing output, not by reading two designs.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CSS, companyCss } from "./styles.mjs";
import {
  engineScripts, ownsOwnIndex, scanScripts, scriptGroups, scriptsNote,
} from "./scripts.mjs";

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COPY_JS = `<script>document.addEventListener('click',e=>{const b=e.target.closest('.copy');if(!b)return;
const t=b.previousElementSibling.textContent;try{navigator.clipboard.writeText(t);}catch(_){const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove();}
b.textContent='copied';setTimeout(()=>b.textContent='copy',1200);});</script>`;

const companyJs = (themeKey) => `<script>(()=>{const key='${themeKey}';const buttons=[...document.querySelectorAll('[data-set-theme]')];
const setTheme=(theme)=>{if(!['storybook','pixel','anime'].includes(theme))theme='storybook';document.body.dataset.theme=theme;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.setTheme===theme)));try{localStorage.setItem(key,theme)}catch{}};
let saved='storybook';try{saved=localStorage.getItem(key)||saved}catch{}setTheme(saved);buttons.forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.setTheme)));
})();</script>`;

// `path` or `path#key` — the key selects an array inside the JSON document.
function loadArray(root, spec) {
  if (!spec) return [];
  const [file, key] = String(spec).split("#");
  try {
    const doc = JSON.parse(readFileSync(join(root, file), "utf8"));
    const value = key ? doc[key] : doc;
    return Array.isArray(value) ? value : [];
  } catch {
    return []; // A missing or malformed collection omits its rows; it never breaks the build.
  }
}

export function createRenderer(ctx) {
  const { config, manifest, governance, tasks, stamp, nowIso } = ctx;
  const { root, brand, generatedMark } = config;

  // ---------- live schedule state ----------
  function taskRow(name) {
    const t = tasks.get(name);
    if (!t) return { name, missing: true };
    return { ...t, name };
  }

  // Does the active adapter actually observe the scheduler? With scheduler "none" — or an
  // adapter that failed to run — nothing was looked at, so a declared task cannot be reported
  // "not registered". Warning about it anyway would manufacture a problem out of an absent
  // measurement, which is worse than saying nothing.
  const observes = ctx.observesScheduler !== false;

  // `ok: null` means the adapter sees the task but records no outcome (cron has no exit code).
  // That is a neutral "registered" chip — never a green pass, and never a failure.
  function schedChip(tr) {
    if (tr.missing) {
      return observes
        ? `<span class="chip warn" title="task not found in the scheduler">${esc(tr.name)}: not registered</span>`
        : `<span class="chip" title="declared in the manifest; no scheduler is being read">${esc(tr.name)} · declared</span>`;
    }
    if (tr.ok == null && !tr.disabled) {
      return `<span class="chip" title="scheduler reports no run outcome · next ${esc(tr.next)}">${esc(tr.name)} · ${esc(tr.schedule)} · registered</span>`;
    }
    const cls = tr.disabled ? "warn" : tr.ok ? "ok" : "bad";
    const state = tr.disabled ? "disabled" : tr.running ? "running" : `rc ${tr.rc}`;
    return `<span class="chip ${cls}" title="last ${esc(tr.last)} → rc ${esc(tr.rc)} · next ${esc(tr.next)}">${esc(tr.name)} · ${esc(tr.schedule)} · ${esc(state)}</span>`;
  }

  function cmdRow(cmd) {
    return `<div class="cmd"><code>${esc(cmd)}</code><button class="copy" type="button">copy</button></div>`;
  }

  // ---------- commands ----------
  function scriptRow(s) {
    const badges = [
      s.scheduled ? `<span class="chip ok">scheduled</span>` : s.wired ? `<span class="chip ok">wired</span>` : "",
      s.danger ? `<span class="chip warn">writes/publishes</span>` : "",
    ].filter(Boolean).join("");
    return `<div class="script">${cmdRow(`npm run ${s.name}`)}
<p class="script-impl mono" title="${esc(s.cmd)}">${esc(s.cmd)}</p>
${s.note || badges ? `<div class="chips">${badges}${s.note ? `<span class="chip">${esc(s.note)}</span>` : ""}</div>` : ""}</div>`;
  }

  function commandsSection(eng) {
    const scripts = engineScripts(root, eng);
    if (!scripts.length) return "";
    const liveCount = scripts.filter((s) => s.wired).length;
    const note = scriptsNote(root, eng.dir);
    const blocks = scriptGroups(scripts)
      .map(([group, items]) => {
        const live = items.some((s) => s.wired);
        return `<details class="script-group"${live ? " open" : ""}><summary>${esc(group)} <span class="section-count">${items.length}${live ? " · in use" : ""}</span></summary>
<div class="script-list">${items.map(scriptRow).join("")}</div></details>`;
      })
      .join("");
    return `<h2>Commands (${scripts.length})</h2>
<p class="doc">Read live from <span class="mono">${esc(eng.dir)}\\package.json</span>. <b>${liveCount}</b> of ${scripts.length} ${liveCount === 1 ? "is" : "are"} referenced by a pipeline node, a server, or a scheduled task — the rest are available but nothing here calls them.</p>
${note ? `<p class="doc"><b>Package note:</b> ${esc(note)}</p>` : ""}
<div class="scripts">${blocks}</div>`;
  }

  const commandsHref = (eng) =>
    `${encodeURI(eng.dir)}/${ownsOwnIndex(root, eng, generatedMark) ? "ops-commands.html" : "index.html"}`;

  // ---------- skills ----------
  function scanSkills(dir) {
    const found = [];
    const skillsDir = join(root, dir, ".claude", "skills");
    try {
      for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
        if (e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md"))) found.push(e.name);
      }
    } catch {}
    try {
      for (const e of readdirSync(join(root, dir, "skills"))) {
        if (e.endsWith(".md")) found.push(`skills/${e}`);
      }
    } catch {}
    return found;
  }

  // ---------- avatars ----------
  // Mascot art is optional and lives outside this package: point config.avatars at a directory
  // of <engineId>.webp. Without it the CSS figure renders instead — not a placeholder, a
  // complete look, which is what lets the public default ship with no illustration at all.
  function avatarArt(id) {
    if (!id || !config.avatars) return null;
    return existsSync(join(config.avatars, `${id}.webp`)) ? `${config.avatarsHref}/${id}.webp` : null;
  }

  function avatarVisual(eng) {
    const avatar = eng.avatar || {};
    const art = avatarArt(eng.id);
    const badge = esc(avatar.badge || eng.id);
    if (art) {
      return `<div class="workstation has-art">
<div class="avatar-art"><img src="${esc(art)}" alt="${esc(eng.name)} mascot" loading="lazy" decoding="async" width="256" height="256"></div>
<span class="avatar-badge" aria-hidden="true">${badge}</span></div>`;
    }
    const style = String(avatar.style || "side").replace(/[^a-z-]/g, "");
    return `<div class="workstation" aria-hidden="true">
<div class="avatar hair-${style}" style="--skin:${esc(avatar.skin || "#c8845b")};--hair:${esc(avatar.hair || "#18151c")};--shirt:${esc(avatar.shirt || eng.accent)}">
<i class="avatar-hair"></i><i class="avatar-head"></i><i class="avatar-eye left"></i><i class="avatar-eye right"></i><i class="avatar-mouth"></i><i class="avatar-body"></i>
</div><div class="desk"><div class="monitor"><b>${badge}</b><span class="monitor-line"></span></div></div></div>`;
  }

  // A task whose outcome is unobservable (ok == null) must not read as a failure here either.
  function stationState(engTasks, projectStatus = null) {
    const bad = engTasks.filter((t) => !t.missing && t.ok === false && !t.disabled);
    const running = engTasks.some((t) => t.running);
    if (bad.length) return { cls: "is-alert", label: `${bad.length} needs attention` };
    if (projectStatus?.health === "blocked") return { cls: "is-alert", label: "project blocked" };
    if (projectStatus?.health === "attention") return { cls: "is-alert", label: "project attention" };
    if (running) return { cls: "is-running", label: "active now" };
    if (projectStatus?.health === "nominal") return { cls: "is-healthy", label: "project nominal" };
    if (engTasks.length) return { cls: "is-healthy", label: "all systems nominal" };
    return { cls: "is-manual", label: "on demand" };
  }

  const governanceProfile = (eng) => governance?.engines?.[eng.id] || null;

  // ---------- project status ----------
  function loadProjectStatus(eng) {
    const relative = eng.statusFile || config.projectStatusFile;
    const path = join(root, eng.dir, relative);
    if (!existsSync(path)) return null;
    try {
      const status = JSON.parse(readFileSync(path, "utf8"));
      const expected = `${config.schemaPrefix}.project-status/v1`;
      if (status.schemaVersion !== expected) throw new Error("unsupported schemaVersion");
      if (status.projectId !== eng.id) throw new Error(`projectId ${status.projectId} does not match ${eng.id}`);
      if (!status.headline || !status.updatedAt || !status.security) throw new Error("missing required rollup fields");
      return { ...status, sourceFile: relative };
    } catch (error) {
      console.warn(`project status ignored for ${eng.id}: ${error.message}`);
      return null;
    }
  }
  const PROJECT_STATUS = new Map(manifest.engines.map((eng) => [eng.id, loadProjectStatus(eng)]));

  // ---------- reports (generated report index) ----------
  function loadReports() {
    const spec = config.reports;
    if (!spec?.dir) return [];
    const pattern = spec.pattern instanceof RegExp
      ? spec.pattern
      : new RegExp(spec.pattern || String.raw`^(.+)-(\d{4}-\d{2}-\d{2})\.html$`);
    const found = [];
    try {
      for (const f of readdirSync(join(root, spec.dir))) {
        const m = f.match(pattern);
        if (m) found.push({ target: m[1], date: m[2], file: f });
      }
    } catch {}
    found.sort((a, b) => b.date.localeCompare(a.date));
    return found;
  }
  const REPORTS = loadReports();
  const reportsTitle = config.reports?.title || "Reports";
  const reportsLabel = config.reports?.label || "report";
  const reportsDir = config.reports?.dir || "";

  // ---------- shared chrome ----------
  function page(title, kicker, body, { bodyClass = "", extraCss = "", extraScript = "", showKicker = true } = {}) {
    return `<!doctype html>
${generatedMark} on ${nowIso} — edit ${brand.manifestLabel}, then re-run ${brand.rebuildHint}. Hand edits will be overwritten. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}${extraCss}</style></head><body class="${esc(bodyClass)}"><div class="wrap">
${showKicker ? `<p class="kicker">${esc(kicker)}</p>` : ""}${body}
<p class="foot">Generated ${esc(stamp)} · ${esc(config.rebuildCommand)} · data: ${esc(brand.footData)}</p>
</div>${COPY_JS}${extraScript}</body></html>`;
  }

  // ---------- engine pages ----------
  function enginePage(eng) {
    const skills = scanSkills(eng.dir);
    const engTasks = (eng.nodes || []).flatMap((n) => n.tasks || []).map(taskRow);
    const report = REPORTS[0];
    const gov = governanceProfile(eng);
    const flow = (eng.nodes || [])
      .map((n) => {
        const chips = (n.tasks || []).map((t) => schedChip(taskRow(t))).join("");
        return `<div class="node"><h4>${esc(n.name)}</h4><p>${esc(n.desc)}</p>${cmdRow(n.cmd)}${chips ? `<div class="chips">${chips}</div>` : ""}</div>`;
      })
      .join('<span class="arrow">→</span>');
    const servers = (eng.servers || [])
      .map((s) => `<tr><td class="mono"><a href="http://127.0.0.1:${s.port}">:${s.port}</a></td><td>${esc(s.what)}</td><td class="mono">${esc(s.start)}</td></tr>`)
      .join("");
    const body = `
<h1>${esc(eng.name)}</h1>
<p class="klass" style="--acc:${eng.accent}">${esc(eng.class)}</p>
<p class="doc">${esc(eng.role)}</p>
${eng.dashboardNote ? `<p class="doc"><b>Live controls:</b> ${esc(eng.dashboardNote)}</p>` : ""}
<p class="doc mono"><a href="../index.html">← all engines</a></p>
<h2>Pipeline</h2><div class="flow" style="--acc:${eng.accent}">${flow || '<p class="doc">Session-driven — no fixed pipeline.</p>'}</div>
<h2>Ingress → Egress</h2>
<table><tr><th>Consumes</th><th>Produces</th></tr><tr>
<td><ul>${(eng.ingress || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></td>
<td><ul>${(eng.egress || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></td></tr></table>
${servers ? `<h2>Servers</h2><table><tr><th>Port</th><th>What</th><th>Start</th></tr>${servers}</table>` : ""}
${commandsSection(eng)}
${engTasks.length ? `<h2>Schedules (live)</h2><div class="chips">${engTasks.map(schedChip).join("")}</div>` : ""}
${gov ? `<h2>AI & automation governance</h2>
<table><tr><th>Assurance</th><th>LLM role</th><th>Standard automation</th><th>Human role</th><th>Authority</th></tr>
<tr><td><span class="chip ok">${esc(gov.assurance)}</span></td><td>${esc(gov.llmRole)}</td><td>${esc(gov.automationRole)}</td><td>${esc(gov.humanRole)}</td><td>${esc(gov.authority)}</td></tr></table>
<p class="doc mono">Canonical policy: ${esc(brand.policyLabel)} · ${esc(governance.doctrine?.summary || "")}</p>` : ""}
${skills.length ? `<h2>Skills</h2><div class="chips">${skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
${(eng.logs || []).length ? `<h2>Logs & state</h2><ul>${eng.logs.map((l) => `<li class="mono">${esc(l)}</li>`).join("")}</ul>` : ""}
${(eng.docs || []).length ? `<h2>Docs</h2><ul>${eng.docs.map((d) => `<li class="mono">${esc(d)}</li>`).join("")}</ul>` : ""}
${report ? `<h2>Security</h2><p class="doc">Last ${esc(reportsLabel)} of <span class="mono">${esc(report.target)}</span>: <b>${esc(report.date)}</b> — <span class="mono">${esc(reportsDir)}/${esc(report.file)}</span></p>` : ""}`;
    return page(`${eng.name} — ${brand.opsLabel}`, brand.engineKicker, body);
  }

  // Standalone command sheet for engines whose index.html we must not touch.
  function commandsPage(eng) {
    const body = `
<h1>${esc(eng.name)} — commands</h1>
<p class="klass" style="--acc:${eng.accent}">${esc(eng.class)}</p>
<p class="doc mono"><a href="../index.html">← company floor</a> · <a href="index.html">${esc(eng.dir)} dashboard</a></p>
${commandsSection(eng)}`;
    return page(`${eng.name} commands — ${brand.opsLabel}`, brand.commandsKicker, body);
  }

  // ---------- master page ----------
  function masterPage() {
    const engineCards = manifest.engines
      .map((eng, index) => {
        const engTasks = (eng.nodes || []).flatMap((n) => n.tasks || []).map(taskRow);
        const projectStatus = PROJECT_STATUS.get(eng.id);
        const state = stationState(engTasks, projectStatus);
        const gov = governanceProfile(eng);
        const controls = (eng.servers || []).map((s) => `<a class="station-control" href="http://127.0.0.1:${s.port}" title="${esc(s.what)}">panel :${s.port}</a>`).join("");
        const pulse = projectStatus ? `<div class="station-pulse"><b>${esc(projectStatus.headline)}</b><span>${(projectStatus.todos || []).length} TODOs · security ${esc(projectStatus.security?.state || "unknown")}</span></div>` : "";
        const scriptCount = engineScripts(root, eng).length;
        const cmdChip = scriptCount ? `<span class="chip chip-link"><a href="${commandsHref(eng)}">${scriptCount} cmds</a></span>` : "";
        const govChip = gov ? `<span class="chip ok">AI: ${esc(gov.assurance)}</span>` : "";
        return `<article class="station ${state.cls}" style="--acc:${eng.accent}" aria-label="${esc(eng.name)} workstation: ${esc(state.label)}">
<div class="station-head"><span class="station-number">DESK ${String(index + 1).padStart(2, "0")}</span><span class="health-pill">${esc(state.label)}</span></div>
<div class="station-body"><div class="station-copy"><h3><a href="${encodeURI(eng.dir)}/index.html">${esc(eng.name)}</a></h3>
<p class="station-label">${esc(eng.avatar?.station || eng.class)}</p><p class="station-role">${esc(eng.role)}</p><div class="chips">${govChip}${cmdChip}</div>${pulse}${controls ? `<div class="station-controls">${controls}</div>` : ""}</div>${avatarVisual(eng)}</div>
<span class="station-path">${esc(brand.pathPrefix)}${esc(eng.dir)}</span></article>`;
      })
      .join("");

    const allTaskNames = [...new Set(manifest.engines.flatMap((e) => (e.nodes || []).flatMap((n) => n.tasks || [])))];
    const schedTable = allTaskNames
      .map(taskRow)
      .sort((a, b) => (a.next || "z").localeCompare(b.next || "z"))
      .map((t) => t.missing
        ? `<tr><td class="mono">${esc(t.name)}</td><td colspan="4"><span class="chip${observes ? " warn" : ""}">${observes ? "not registered" : "declared in manifest · no scheduler read"}</span></td></tr>`
        : `<tr><td class="mono">${esc(t.name)}</td><td>${esc(t.schedule)}</td><td class="mono">${esc(t.next)}</td><td class="mono">${esc(t.last)}</td><td>${t.ok == null && !t.disabled
          ? `<span class="chip">registered</span>`
          : `<span class="chip ${t.disabled ? "warn" : t.ok ? "ok" : "bad"}">${t.disabled ? "disabled" : t.running ? "running" : `rc ${esc(t.rc)}`}</span>`}</td></tr>`)
      .join("");

    // Extra tables. A collection declares its sources and headers; `rows` may be a function so a
    // config can express a cross-check the package has no business knowing about.
    const collectionSections = (config.collections || []).map((collection) => {
      const data = {};
      for (const [key, spec] of Object.entries(collection.sources || {})) data[key] = loadArray(root, spec);
      const rows = typeof collection.rows === "function"
        ? collection.rows(data, { esc })
        : (data.items || []).map((item) => `<tr>${(collection.headers || []).map((h) => `<td>${esc(item[h.field ?? h] ?? "")}</td>`).join("")}</tr>`).join("");
      if (!rows) return "";
      const headers = (collection.headers || []).map((h) => `<th>${esc(typeof h === "string" ? h : h.label)}</th>`).join("");
      const count = typeof collection.countLabel === "function" ? collection.countLabel(data) : collection.countLabel || "";
      return `<details class="ops-section" id="${esc(collection.id)}"${collection.open ? " open" : ""}><summary>${esc(collection.title)} <span class="section-count">${esc(count)}</span></summary><div class="table-shell"><table><tr>${headers}</tr>${rows}</table></div></details>`;
    }).join("\n    ");

    // Satellites have no page of their own, so their command surface is listed here inline.
    const satelliteScripts = new Map((manifest.satellites || [])
      .map((s) => [s, scanScripts(root, s.dir, { notes: s.scriptNotes || {} })])
      .filter(([, scripts]) => scripts.length));
    const satellites = (manifest.satellites || [])
      .map((s) => {
        const count = satelliteScripts.get(s)?.length || 0;
        return `<tr><td><b>${esc(s.name)}</b>${count ? ` <span class="chip">${count} cmds</span>` : ""}</td><td class="doc">${esc(s.note)}</td><td class="mono">${s.url ? `<a href="${esc(s.url)}">${esc(s.url)}</a>` : esc(s.path || s.start || "")}</td></tr>`;
      })
      .join("");
    const satelliteCommands = [...satelliteScripts.entries()]
      .map(([s, scripts]) => `<details class="script-group"><summary>${esc(s.name)} <span class="section-count">${esc(s.dir)}\\package.json · ${scripts.length}</span></summary>
<div class="script-list">${scripts.map(scriptRow).join("")}</div></details>`)
      .join("");

    const projectContractCount = [...PROJECT_STATUS.values()].filter(Boolean).length;
    const projectRows = manifest.engines.map((eng) => {
      const status = PROJECT_STATUS.get(eng.id);
      const href = `${encodeURI(eng.dir)}/${encodeURI(status?.statusPage || "index.html")}`;
      if (!status) {
        const pagePath = join(root, eng.dir, "index.html");
        let pageUpdated = "not generated";
        try { pageUpdated = statSync(pagePath).mtime.toISOString().replace("T", " ").slice(0, 16); } catch {}
        const engTasks = (eng.nodes || []).flatMap((node) => node.tasks || []).map(taskRow);
        const attention = engTasks.filter((task) => task.missing || (task.ok === false && !task.disabled)).length;
        const portfolio = config.reports?.portfolioTarget
          ? REPORTS.find((r) => r.target === config.reports.portfolioTarget)
          : null;
        const security = portfolio
          ? `<span class="chip warn">portfolio scan · ${esc(portfolio.date)}</span><br><span class="mono">project coverage unverified</span>`
          : `<span class="chip warn">no project scan receipt</span>`;
        return `<tr><td><a href="${href}"><b>${esc(eng.name)}</b></a><br><span class="mono">derived from manifest/index</span></td><td class="mono">${esc(pageUpdated)}</td><td class="doc">${esc(eng.dashboardNote || eng.role)}</td><td><b>${attention}</b> scheduler signals<br><span class="mono">TODO feed not published</span></td><td>${security}</td></tr>`;
      }
      const security = status.security || {};
      const securityClass = security.state === "current" ? "ok" : security.state === "unknown" ? "warn" : "bad";
      const securityLabel = security.lastScanAt ? `${security.state} · ${String(security.lastScanAt).slice(0, 10)}` : security.state || "unknown";
      const report = security.reportPath ? `<br><a class="mono" href="${encodeURI(security.reportPath)}">report</a>` : "";
      return `<tr><td><a href="${href}"><b>${esc(status.name || eng.name)}</b></a><br><span class="mono">${esc(status.sourceFile)}</span></td><td class="mono">${esc(String(status.updatedAt).replace("T", " ").slice(0, 16))}</td><td class="doc">${esc(status.headline)}</td><td><b>${(status.todos || []).length}</b> open priorities</td><td><span class="chip ${securityClass}">${esc(securityLabel)}</span>${report}</td></tr>`;
    }).join("");

    const reportRows = REPORTS.slice(0, 5)
      .map((r) => `<tr><td class="mono">${esc(r.target)}</td><td><b>${esc(r.date)}</b></td><td class="mono">${esc(reportsDir)}/${esc(r.file)}</td></tr>`)
      .join("");

    const governanceRows = governance ? manifest.engines.map((eng) => {
      const gov = governanceProfile(eng);
      if (!gov) return "";
      return `<tr><td><a href="${encodeURI(eng.dir)}/index.html"><b>${esc(eng.name)}</b></a></td><td><span class="chip ok">${esc(gov.assurance)}</span></td><td>${esc(gov.llmRole)}</td><td>${esc(gov.automationRole)}</td><td>${esc(gov.humanRole)}</td><td>${esc(gov.authority)}</td></tr>`;
    }).join("") : "";

    const alertCount = allTaskNames.map(taskRow).filter((t) => !t.missing && t.ok === false && !t.disabled).length;
    const workerCount = Object.keys(governance?.workers || {}).length;

    const statTiles = [
      `<div class="company-stat"><b>${manifest.engines.length}</b><span>workstations</span></div>`,
      governance ? `<div class="company-stat"><b>${workerCount}</b><span>pinned workers</span></div>` : "",
      `<div class="company-stat"><b>${projectContractCount}</b><span>status feeds</span></div>`,
      `<div class="company-stat"><b>${allTaskNames.length}</b><span>scheduled jobs</span></div>`,
      ...(config.collections || []).filter((c) => c.stat).map((c) => {
        const data = {};
        for (const [key, spec] of Object.entries(c.sources || {})) data[key] = loadArray(root, spec);
        return `<div class="company-stat"><b>${c.stat.count(data)}</b><span>${esc(c.stat.label)}</span></div>`;
      }),
    ].filter(Boolean).join("");

    const navLinks = [
      `<a href="#company-floor">Company floor</a>`,
      governance ? `<a href="#governance">AI governance</a>` : "",
      `<a href="#projects">Project pulse</a>`,
      `<a href="#schedules">Schedules</a>`,
      ...(config.collections || []).filter((c) => c.nav).map((c) => `<a href="#${esc(c.id)}">${esc(c.nav)}</a>`),
      `<a href="#satellites">Network</a>`,
    ].filter(Boolean).join("");

    const body = `
<header class="company-hero">
  <nav class="company-nav" aria-label="Company navigation"><div class="brand-lockup"><span class="brand-mark">${esc(brand.mark)}</span> ${esc(brand.name)}</div>
  <div class="company-links">${navLinks}</div></nav>
  <div class="hero-inner"><p class="hero-eyebrow"><span class="live-dot"></span> Local company online · ${alertCount ? `${alertCount} item${alertCount === 1 ? "" : "s"} need attention` : "all scheduled systems nominal"}</p>
  <h1>${brand.headline}</h1>
  <p class="hero-copy">${esc(brand.blurb)}</p>
  <div class="company-stats">${statTiles}</div></div>
</header>
<main class="company-main">
  <div class="floor-heading"><div><h2>${esc(brand.floorHeading)}</h2><p>${esc(brand.floorSubheading)}</p></div>
  <div class="theme-switcher" role="group" aria-label="Company art direction"><button class="theme-btn" type="button" data-set-theme="storybook" aria-pressed="true">Storybook</button><button class="theme-btn" type="button" data-set-theme="pixel" aria-pressed="false">16-bit HQ</button><button class="theme-btn" type="button" data-set-theme="anime" aria-pressed="false">Neo Anime</button></div></div>
  <section class="company-floor" id="company-floor" aria-label="${esc(brand.floorAria)}">
    <div class="floor-status"><span>Company floor · live machine snapshot ${esc(stamp)}</span><span class="floor-legend"><span class="legend-item"><i class="legend-swatch good"></i>Nominal</span><span class="legend-item"><i class="legend-swatch alert"></i>Attention</span><span class="legend-item"><i class="legend-swatch manual"></i>On demand</span></span></div>
    <div class="station-grid">${engineCards}</div>
  </section>
  <section class="ops-directory" aria-labelledby="ops-directory-title"><h2 id="ops-directory-title">Operations directory</h2><p class="doc">The full factual layer is still here. Open a department to inspect the current machine snapshot.</p>
    ${governance ? `<details class="ops-section" id="governance" open><summary>AI & automation governance <span class="section-count">${manifest.engines.length} engine profiles · ${workerCount} pinned workers</span></summary><div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)"><p class="doc"><b>${esc(governance.doctrine?.summary || "")}</b> ${esc(governance.doctrine?.publicExplanation || "")}</p>${config.governanceChips ? config.governanceChips(governance, { esc }) : ""}<p class="doc mono">${config.governanceProvenance ? config.governanceProvenance(governance, { esc }) : `Canonical policy: ${esc(brand.policyLabel)}${governance.updatedAt ? ` · updated ${esc(governance.updatedAt)}` : ""}`}</p></div><div class="table-shell"><table><tr><th>Engine</th><th>Assurance</th><th>LLM role</th><th>Standard automation</th><th>Human role</th><th>Authority</th></tr>${governanceRows}</table></div></details>` : ""}
    <details class="ops-section" id="projects" open><summary>Project pulse <span class="section-count">${projectContractCount} structured feeds · ${manifest.engines.length - projectContractCount} derived pages</span></summary><div class="table-shell"><table><tr><th>Project</th><th>Updated</th><th>What changed</th><th>TODOs</th><th>Security</th></tr>${projectRows}</table></div></details>
    <details class="ops-section" id="schedules" open><summary>${esc(brand.schedulesTitle)} <span class="section-count">${allTaskNames.length} jobs · live state</span></summary><div class="table-shell"><table><tr><th>Task</th><th>Schedule</th><th>Next run</th><th>Last run</th><th>State</th></tr>${schedTable}</table></div></details>
    ${collectionSections}
    <details class="ops-section" id="satellites"><summary>Satellites & sites <span class="section-count">${manifest.satellites?.length || 0} connected properties</span></summary><div class="table-shell"><table><tr><th>What</th><th>Note</th><th>Where</th></tr>${satellites}</table></div>${satelliteCommands ? `<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)"><p class="doc">Satellites have no engine page — their npm commands, read live from each package.json:</p><div class="scripts">${satelliteCommands}</div></div>` : ""}</details>
    ${reportRows ? `<details class="ops-section"><summary>${esc(reportsTitle)} <span class="section-count">latest 5 reports</span></summary><div class="table-shell"><table><tr><th>Target</th><th>Date</th><th>Report</th></tr>${reportRows}</table></div></details>` : ""}
    <details class="ops-section"><summary>Refresh this snapshot <span class="section-count">generator-safe</span></summary><div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">${cmdRow(config.rebuildCommand)}</div></details>
  </section>
</main>`;
    return page(brand.name, brand.kicker, body, {
      bodyClass: "company-page",
      extraCss: companyCss(config.backdrops),
      extraScript: companyJs(brand.themeKey),
      showKicker: false,
    });
  }

  return { masterPage, enginePage, commandsPage, taskRow, PROJECT_STATUS, REPORTS };
}
