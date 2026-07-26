// Sessions panel — powered by Session Index (https://github.com/pickbitsai/session-index).
//
// Answers "where has the work actually been happening, and what did I leave open" across every
// project at once. Session Index already does the hard part (finding and parsing local Claude
// and Codex session logs); this reads its localhost API at build time.
//
// PRIVACY: a session record carries `title` and `about`, and both are derived from PROMPT TEXT —
// the literal words you typed. A generated dashboard is a file that gets screenshotted, shared
// and served, so this panel renders AGGREGATES by default: counts, agent split, last activity,
// message and token totals. Set `showTitles: true` only if you understand that it writes recent
// prompt text into a static HTML file on disk.
//
// The API is localhost-only and Session Index has no telemetry, so this adds no network exposure
// beyond a loopback request. If it is not running, the panel is omitted — a dashboard that fails
// to build because an optional viewer is closed would be worse than one that quietly omits it.

export const id = "sessions";
export const title = "Agent sessions";
export const nav = "Sessions";

const DEFAULT_URL = "http://127.0.0.1:4173";

export async function collect({ config, manifest, settings = {} }) {
  const base = (settings.url || DEFAULT_URL).replace(/\/$/, "");
  const timeout = settings.timeoutMs ?? 4000;

  let payload;
  try {
    const response = await fetch(`${base}/api/sessions/scan`, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    throw new Error(`Session Index not reachable at ${base} (${error.message}) — start it with \`npm start\` in its directory`);
  }
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  if (!sessions.length) return null;

  // Key sessions to manifest projects by folder. A session in a directory no engine declares is
  // still counted, under its own name — that is often the most interesting row.
  const byDir = new Map(manifest.engines.map((e) => [e.dir.toLowerCase(), e]));
  const rootLower = String(config.root).toLowerCase().replace(/[/\\]$/, "");
  const groups = new Map();

  for (const s of sessions) {
    const folder = String(s.folder || "").replace(/[/\\]$/, "");
    const lower = folder.toLowerCase();
    const relative = lower.startsWith(rootLower) ? folder.slice(rootLower.length).replace(/^[/\\]/, "") : folder;
    const key = relative || "(workspace root)";
    const eng = byDir.get(key.toLowerCase()) || null;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: eng?.name || key,
        dir: eng?.dir || null,
        total: 0,
        agents: {},
        messages: 0,
        // Session Index does not report a message count for every session — it is absent on
        // Codex sessions and on older Claude ones. Track how many actually reported, so a sum
        // built from 1 of 4 sessions is never displayed as if it covered all 4, and "no session
        // reported" is never displayed as the number zero.
        messagesReported: 0,
        contextTokens: 0,
        contextReported: 0,
        lastActivity: null,
        recent: [],
      });
    }
    const g = groups.get(key);
    g.total++;
    const agent = s.agent || "unknown";
    g.agents[agent] = (g.agents[agent] || 0) + 1;
    const messages = Number(s.metadata?.messages);
    if (Number.isFinite(messages)) { g.messages += messages; g.messagesReported++; }
    const context = Number(s.metadata?.contextTokens);
    if (Number.isFinite(context)) { g.contextTokens += context; g.contextReported++; }
    const at = s.activityAt || s.updatedAt;
    if (at && (!g.lastActivity || at > g.lastActivity)) g.lastActivity = at;
    // Titles are prompt text — collected only when explicitly enabled (see the header note).
    if (settings.showTitles === true) {
      g.recent.push({ title: s.title || "(untitled)", agent, at, model: s.metadata?.model || "" });
    }
  }

  const rows = [...groups.values()].sort((a, b) => String(b.lastActivity || "").localeCompare(String(a.lastActivity || "")));
  for (const r of rows) r.recent = r.recent.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, settings.recentPerProject ?? 3);

  const agentTotals = {};
  for (const s of sessions) agentTotals[s.agent || "unknown"] = (agentTotals[s.agent || "unknown"] || 0) + 1;

  return {
    base,
    rows,
    total: sessions.length,
    agentTotals,
    scannedAt: payload.scannedAt || null,
    showTitles: settings.showTitles === true,
  };
}

export function stat(data) {
  return { label: "agent sessions", value: data.total };
}

const ago = (iso) => {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 31 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
};

const compact = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n || 0));

/**
 * Render a summed metric alongside how much of the group it actually covers.
 *
 * Nothing reported → an em dash, not zero: "0 messages" for a project with four sessions reads
 * as "nothing happened here", which is a stronger and wronger claim than "not measured".
 * Partially reported → the sum plus its coverage, so a total built from one session out of four
 * cannot be mistaken for the whole.
 */
function coverage(sum, reported, total, esc) {
  if (!reported) return `<span class="chip" title="the scanner reports no count for these sessions">—</span>`;
  if (reported < total) {
    return `${compact(sum)} <span style="color:#6f6f8c" title="summed from ${reported} of ${total} sessions; the rest report no count">(${reported}/${total})</span>`;
  }
  return compact(sum);
}

export function render(data, { esc }) {
  if (!data.rows.length) return "";

  const agentChips = Object.entries(data.agentTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([agent, n]) => `<span class="chip">${esc(agent)}: ${n}</span>`)
    .join("");

  const rows = data.rows.map((r) => {
    const name = r.dir ? `<a href="${encodeURI(r.dir)}/index.html">${esc(r.name)}</a>` : esc(r.name);
    const agents = Object.entries(r.agents).map(([a, n]) => `${a} ${n}`).join(" · ");
    const titles = data.showTitles && r.recent.length
      ? `<br>${r.recent.map((s) => `<span class="mono" style="color:#6f6f8c">${esc(s.title.slice(0, 70))}</span>`).join("<br>")}`
      : "";
    return `<tr><td><b>${name}</b>${titles}</td><td class="mono">${r.total}</td><td class="mono">${esc(agents)}</td>
<td class="mono">${coverage(r.messages, r.messagesReported, r.total, esc)}</td><td class="mono">${coverage(r.contextTokens, r.contextReported, r.total, esc)}</td><td class="mono">${esc(ago(r.lastActivity))}</td></tr>`;
  }).join("");

  return `<details class="ops-section" id="sessions"><summary>${esc(title)} <span class="section-count">${data.total} sessions · ${data.rows.length} projects</span></summary>
<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">
<p class="doc">Local Claude and Codex sessions, grouped by the project they ran in — where the work actually happened, and what is worth picking back up. Read live from <a href="${esc(data.base)}">Session Index</a>.</p>
<div class="chips">${agentChips}</div>
${data.showTitles ? `<p class="doc mono" style="color:#ffcc44">showTitles is on — recent prompt text is written into this page.</p>` : ""}</div>
<div class="table-shell"><table><tr><th>Project</th><th>Sessions</th><th>Agents</th><th>Messages</th><th>Context</th><th>Last activity</th></tr>${rows}</table></div></details>`;
}
