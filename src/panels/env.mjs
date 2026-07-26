// Environment panel — powered by enview (https://github.com/pickbitsai/enView).
//
// PRIVACY CONTRACT, and the reason this panel is safe to render at all: enview reads .env values
// only to classify them (encrypted? placeholder? credential-shaped name?) and never returns
// them. What reaches this file is key NAMES, counts, encryption status, gitignore status and
// timestamps. This panel narrows that further — it renders counts and status, and names only
// under the collapsed "exposed keys" detail, because a key name still tells a reader which
// services you use.
//
// Nothing here can reach a publish target: publicSnapshot is a separate allowlist that has no
// knowledge of panels.
//
// enview is an optional dependency. Without it this panel does not render, and the build says so
// once rather than failing.

export const id = "env";
export const title = "Environment & secrets";
export const nav = "Secrets";

// Resolve the optional dependency from the CONSUMER's directory, not this package's.
//
// The consumer installs enview, so that is where it lives. A bare `import("enview")` resolves
// relative to this file, which fails whenever company-os is symlinked (npm link, a file:
// dependency, a monorepo) — Node resolves the real path first, landing outside the project that
// installed the dep. Trying the config directory first fixes that, and the bare specifier still
// covers the ordinary nested-node_modules case.
async function loadEnview(configDir) {
  try {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const require = createRequire(pathToFileURL(`${configDir}/package.json`));
    return await import(pathToFileURL(require.resolve("enview")).href);
  } catch {}
  return await import("enview");
}

export async function collect({ config, manifest, settings = {} }) {
  let enview;
  try {
    enview = await loadEnview(config.configDir);
  } catch {
    throw new Error("enview is not installed (npm i enview) — panel skipped");
  }
  if (typeof enview.scanProjects !== "function") {
    throw new Error("installed enview has no scanProjects(); needs enview >= 0.2.0");
  }

  const roots = settings.roots?.length ? settings.roots : [config.root];
  const scanned = enview.scanProjects(roots, { maxDepth: settings.maxDepth ?? 3 });
  const audit = enview.auditProjects(scanned);

  // Key names are the most sensitive thing here, so they are opt-in.
  const showKeys = settings.showKeyNames === true;

  // Map scanned projects onto manifest engines where the paths line up, so the table reads in
  // the same order as the floor. Anything unmatched is still listed — an untracked .env in a
  // directory nobody declared is exactly the thing worth noticing.
  const byDir = new Map(manifest.engines.map((e) => [e.dir.toLowerCase(), e]));
  const rows = [];
  for (const project of scanned) {
    for (const file of project.files) {
      const rel = file.projectDir.replace(/[/\\]$/, "").split(/[/\\]/).pop().toLowerCase();
      const eng = byDir.get(rel) || null;
      rows.push({
        project: eng?.name || project.name,
        dir: eng?.dir || null,
        fileName: file.fileName,
        environment: file.environment,
        keys: file.keys.length,
        plaintext: file.plaintextKeys.length,
        encrypted: file.encryptedKeys.length,
        encryption: file.encryption?.type || "none",
        gitIgnored: file.gitIgnored,
        gitTracked: file.gitTracked,
        gitInHistory: file.gitInHistory,
        inGitRepo: file.inGitRepo,
        modifiedAt: file.modifiedAt,
        // Names only, and only when explicitly enabled.
        exposedKeys: showKeys ? file.sensitiveKeys : [],
        sensitiveCount: file.sensitiveKeys.length,
      });
    }
  }
  rows.sort((a, b) => b.sensitiveCount - a.sensitiveCount || a.project.localeCompare(b.project));

  return {
    rows,
    findings: audit.findings,
    summary: audit.summary,
    showKeys,
    // The dashboard is a static file, so it deliberately stops at status and counts. Anything
    // that needs a value — reveal, copy, edit — happens in the enview UI, which is a live
    // localhost server that reads on demand and persists nothing. This is the tunnel.
    uiUrl: settings.uiUrl || "http://127.0.0.1:4174",
    uiCommand: settings.uiCommand || `npx enview ui ${roots.map((r) => `"${r}"`).join(" ")}`,
  };
}

export function stat(data) {
  return { label: "exposed keys", value: data.rows.reduce((n, r) => n + r.sensitiveCount, 0) };
}

const age = (d) => {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 31) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

export function render(data, { esc, cmdRow }) {
  if (!data.rows.length) return "";

  const exposed = data.rows.reduce((n, r) => n + r.sensitiveCount, 0);
  const inHistory = data.rows.filter((r) => (r.gitTracked || r.gitInHistory) && r.encryption === "none" && r.plaintext > 0);
  const tracked = inHistory.filter((r) => r.gitTracked);
  const unignored = data.rows.filter((r) => r.inGitRepo && !r.gitIgnored && !r.gitTracked && !r.gitInHistory);

  // Ordered by what it would actually cost you. A tracked file is already in history on every
  // clone and remote — .gitignore cannot retract it, so rotation is the only fix. A merely
  // unignored file is one command away from that. Everything else is hygiene.
  const lead = inHistory.length
    ? `<p class="doc"><span class="chip bad">${inHistory.length} file${inHistory.length === 1 ? "" : "s"} in git history</span>${tracked.length ? ` <span class="chip warn">${tracked.length} still tracked</span>` : ""} These have been committed — they are in history on every clone and every remote. Adding them to <span class="mono">.gitignore</span> does not retract them; the credentials have to be rotated. A file that is gitignored <em>and</em> in history looks safe and is not.</p>`
    : unignored.length
      ? `<p class="doc"><span class="chip bad">${unignored.length} file${unignored.length === 1 ? "" : "s"} not gitignored</span> A plaintext env file inside a git repository that git is not ignoring is one <span class="mono">git add -A</span> away from being committed.</p>`
      : `<p class="doc"><span class="chip ok">all gitignored</span> Every env file inside a git repository is ignored by git. ${exposed ? `<b>${exposed}</b> credential-shaped keys are still stored in plaintext on disk, readable by any process, script or agent that can read the file.` : ""}</p>`;

  const rows = data.rows.map((r) => {
    const encChip = r.encryption === "none"
      ? `<span class="chip warn">none</span>`
      : `<span class="chip ok">${esc(r.encryption)}</span>`;
    const gitChip = !r.inGitRepo
      ? `<span class="chip">not in git</span>`
      : r.gitTracked ? `<span class="chip bad" title="git is tracking this file right now — git rm --cached, gitignore, then rotate">TRACKED</span>`
        : r.gitInHistory ? `<span class="chip bad" title="not tracked now, but present in git history — rotate the credentials">IN HISTORY</span>`
          : r.gitIgnored ? `<span class="chip ok">ignored</span>` : `<span class="chip bad">NOT ignored</span>`;
    const name = r.dir ? `<a href="${encodeURI(r.dir)}/index.html">${esc(r.project)}</a>` : esc(r.project);
    return `<tr><td><b>${name}</b></td><td class="mono">${esc(r.fileName)}</td><td class="mono">${esc(r.environment)}</td>
<td class="mono">${r.keys}</td><td>${r.sensitiveCount ? `<span class="chip warn">${r.sensitiveCount}</span>` : `<span class="chip ok">0</span>`}</td>
<td>${encChip}</td><td>${gitChip}</td><td class="mono">${esc(age(r.modifiedAt))}</td></tr>`;
  }).join("");

  const keyDetail = data.showKeys
    ? data.rows.filter((r) => r.exposedKeys.length).map((r) => `<details class="script-group"><summary>${esc(r.project)} · ${esc(r.fileName)} <span class="section-count">${r.exposedKeys.length} credential-shaped</span></summary>
<div style="padding:10px 13px"><p class="doc mono">${r.exposedKeys.map(esc).join(" · ")}</p></div></details>`).join("")
    : "";

  return `<details class="ops-section" id="env"${unignored.length ? " open" : ""}><summary>${esc(title)} <span class="section-count">${data.rows.length} env file${data.rows.length === 1 ? "" : "s"} · ${exposed} plaintext credential${exposed === 1 ? "" : "s"}</span></summary>
<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">${lead}
<p class="doc">This page is a static file, so it stops at status and counts — <b>no values, and no key names, are ever written into it</b>. To reveal, copy or edit a value, open the enview manager: a localhost server that reads on demand, persists nothing, and writes a timestamped backup before every change.</p>
<div class="chips"><span class="chip chip-link"><a href="${esc(data.uiUrl)}">open enview manager →</a></span></div>
${cmdRow(data.uiCommand)}</div>
<div class="table-shell"><table><tr><th>Project</th><th>File</th><th>Env</th><th>Keys</th><th>Credential-shaped</th><th>Encrypted</th><th>git</th><th>Modified</th></tr>${rows}</table></div>
${keyDetail ? `<div style="padding:12px 16px"><div class="scripts">${keyDetail}</div></div>` : ""}</details>`;
}
