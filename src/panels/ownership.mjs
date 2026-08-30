// Areas of responsibility panel.
//
// Ownership is useful only when the gaps stay visible. Declared owners are grouped in manifest
// order, followed by an explicit Unassigned row that is either a warning or a positive proof
// that every engine and satellite has an accountable party.

export const id = "ownership";
export const title = "Areas of responsibility";
export const nav = "Ownership";

export function collect({ manifest }) {
  const engines = manifest.engines || [];
  const satellites = manifest.satellites || [];
  const owners = Object.entries(manifest.owners || {}).map(([ownerId, owner]) => ({
    id: ownerId,
    ...owner,
    engines: engines.filter((project) => project.owner === ownerId).map((project) => project.name),
    satellites: satellites.filter((project) => project.owner === ownerId).map((project) => project.name),
  }));
  return {
    owners,
    projectCount: engines.length + satellites.length,
    unassignedEngines: engines.filter((project) => !project.owner).map((project) => project.name),
    unassignedSatellites: satellites.filter((project) => !project.owner).map((project) => project.name),
  };
}

export function render(data, { esc }) {
  const names = (items) => items.length ? items.map(esc).join(", ") : "—";
  const rows = data.owners.map((owner) => `<tr><td><b>${esc(owner.name)}</b><br><span class="mono">${esc(owner.id)}</span></td><td class="doc">${esc(owner.what)}</td><td>${names(owner.engines)}</td><td>${names(owner.satellites)}</td></tr>`).join("");
  const unassigned = [...data.unassignedEngines, ...data.unassignedSatellites];
  const status = unassigned.length
    ? `<span class="chip warn">${names(unassigned)}</span>`
    : `<span class="chip ok">every project has an owner</span>`;
  const finalRow = `<tr><td><b>Unassigned</b><br>${status}</td><td>—</td><td>${names(data.unassignedEngines)}</td><td>${names(data.unassignedSatellites)}</td></tr>`;

  return `<details class="ops-section" id="ownership"><summary>${esc(title)} <span class="section-count">${data.owners.length} owners · ${data.projectCount} projects</span></summary>
<div class="table-shell"><table><tr><th>Owner</th><th>Answers for</th><th>Engines</th><th>Satellites</th></tr>${rows}${finalRow}</table></div></details>`;
}
