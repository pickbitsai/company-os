// Parent-owned inventory of repository-owned intranet pages.

import { maintainIntranet } from "../intranet.mjs";

export const id = "intranet";
export const title = "Intranet pages";
export const nav = "Intranet";

export async function collect({ config, manifest, intranetState, nowIso }) {
  if (!config.intranet) return null;
  return intranetState || await maintainIntranet(config, manifest, {
    mode: "panel-scan",
    execute: false,
    now: new Date(nowIso),
  });
}

export function stat(data) {
  return { label: "intranet pages", value: data.pages.length };
}

function tone(status) {
  if (status === "healthy") return "ok";
  if (status === "needs-review" || status === "stale") return "warn";
  return "bad";
}

export function render(data, { esc }) {
  if (!data.pages.length) return "";
  const rows = data.pages.map((page) => {
    const rule = page.ownership === "company-os"
      ? `<span class="chip ok">parent-maintained</span>`
      : page.agentMaintenance === false
      ? `<span class="chip">not required</span>`
      : page.agent?.rules && page.agent?.skill
        ? `<span class="chip ok">agent-ready</span>`
        : `<span class="chip warn">agent rules incomplete</span>`;
    const detail = page.links?.broken?.length
      ? `${page.links.broken.length} broken local link${page.links.broken.length === 1 ? "" : "s"}`
      : `${page.links?.checked || 0} local links checked`;
    const registration = page.registration === "accepted"
      ? `<span class="chip ok">accepted</span>`
      : `<span class="chip warn">candidate</span>`;
    return `<tr>
<td><a href="${encodeURI(page.path)}"><b>${esc(page.title)}</b></a><br><span class="mono">${esc(page.path)}</span></td>
<td>${esc(page.projectName || page.projectId)}</td>
<td><span class="chip ${tone(page.status)}">${esc(page.status)}</span> ${registration}<br><span class="mono">${esc(detail)}</span></td>
<td>${rule}</td>
<td><span class="chip">${esc(page.ownership)}</span>${page.generator ? `<br><span class="mono">${esc(page.generator)}</span>` : ""}</td>
</tr>`;
  }).join("");
  const healthy = data.summary.healthy || 0;
  const attention = data.pages.length - healthy;
  return `<details class="ops-section" id="intranet" open><summary>${esc(title)} <span class="section-count">${data.pages.length} pages · ${healthy} healthy${attention ? ` · ${attention} attention` : ""}</span></summary>
<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.07)"><p class="doc">Company OS owns discovery, navigation, and maintenance status. Each repository still owns its page content and generator. A refresh never approves, schedules, dispatches, publishes, deletes, or relocates content.</p></div>
<div class="table-shell"><table><tr><th>Page</th><th>Project</th><th>Health</th><th>Agent maintenance</th><th>Owner / generator</th></tr>${rows}</table></div></details>`;
}
