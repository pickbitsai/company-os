// Resolve both group links and old section links. This function also runs in the generated page.
export function resolveGroup(hash, { defaultGroup, groups, sectionGroups }) {
  let id = hash.slice(1);
  try { id = decodeURIComponent(id); } catch {}
  if (id.startsWith("g-") && groups.includes(id.slice(2))) return id.slice(2);
  return Object.hasOwn(sectionGroups, id) ? sectionGroups[id] : defaultGroup;
}

export function groupNavigation(nav, sectionIds) {
  const groups = nav.groups.map(({ id, label }) => ({ id, label }));
  const ids = new Set(groups.map(({ id }) => id));
  if (ids.size !== groups.length || groups.some(({ id }) => typeof id !== "string" || !id.trim())) {
    throw new Error("nav.groups must have unique, nonempty string ids");
  }
  const rendered = new Set(sectionIds);
  const sectionGroups = new Map();
  for (const { id, sections = [] } of nav.groups) {
    for (const section of sections) {
      if (rendered.has(section) && !sectionGroups.has(section)) sectionGroups.set(section, id);
    }
  }
  const unplaced = sectionIds.filter((id) => !sectionGroups.has(id));
  if (unplaced.length) {
    let more = "more";
    for (let suffix = 2; ids.has(more); suffix++) more = `more-${suffix}`;
    groups.push({ id: more, label: "More" });
    for (const id of unplaced) sectionGroups.set(id, more);
  }
  const defaultGroup = ids.has(nav.defaultGroup) ? nav.defaultGroup : groups[0]?.id;
  return {
    groups,
    table: { defaultGroup, groups: groups.map(({ id }) => id), sectionGroups: Object.fromEntries(sectionGroups) },
  };
}

function activateGroups(table, resolve) {
  const sections = [...document.querySelectorAll("[data-nav-group]")];
  const links = [...document.querySelectorAll(".company-group-links a")];
  const directory = document.querySelector(".ops-directory");
  const update = () => {
    const group = resolve(location.hash, table);
    for (const section of sections) section.hidden = section.dataset.navGroup !== group;
    directory.hidden = !sections.some((section) => !section.hidden && directory.contains(section));
    for (const link of links) {
      if (link.dataset.group === group) {
        link.setAttribute("aria-current", "location");
        const row = link.parentElement;
        const bounds = link.getBoundingClientRect();
        const viewport = row.getBoundingClientRect();
        if (bounds.left < viewport.left) row.scrollLeft += bounds.left - viewport.left;
        if (bounds.right > viewport.right) row.scrollLeft += bounds.right - viewport.right;
      } else {
        link.removeAttribute("aria-current");
      }
    }
    let id = location.hash.slice(1);
    try { id = decodeURIComponent(id); } catch {}
    if (Object.hasOwn(table.sectionGroups, id)) document.getElementById(id)?.scrollIntoView();
    else if (location.hash) window.scrollTo(0, 0);
  };
  update();
  window.addEventListener("hashchange", update);
}

export function groupNavigationJs(table) {
  const data = JSON.stringify(table).replace(/</g, "\\u003c");
  return `(${activateGroups})(${data}, ${resolveGroup});\n`;
}

export const GROUP_NAV_CSS = `
.company-page [data-nav-group][hidden],.company-page .ops-directory[hidden]{display:none}
.company-group-links{min-width:0;display:flex;gap:4px;overflow-x:auto;padding:2px 2px 4px;scrollbar-width:thin}
.company-group-links a{flex:none;display:flex;align-items:center;min-height:38px;padding:0 12px;border-radius:8px;white-space:nowrap}
.company-group-links a:hover,.company-group-links a[aria-current]{color:#fff;background:rgba(255,255,255,.10)}
.company-group-links a[aria-current]{box-shadow:inset 0 -2px var(--cyan)}
.company-group-links a:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
.company-page [id][data-nav-group]{scroll-margin-top:85px}
.company-page .floor-heading[hidden] ~ .ops-directory{margin-top:0}
@media(max-width:640px){
  .company-nav:has(.company-group-links){display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:8px 0 3px}
  .company-nav .company-group-links{display:flex}
  .company-page [id][data-nav-group]{scroll-margin-top:115px}
}
`;
