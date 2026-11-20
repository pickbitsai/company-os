import { connect } from "node:net";

// Tokenize generated tags so escaped markup, attributes and inline scripts are never
// mistaken for live links. Keep the original inner HTML of a link when removing it.
const TAG = /<!--[\s\S]*?-->|<(?:script|style|textarea|title)\b(?:"[^"]*"|'[^']*'|[^'">])*?>[\s\S]*?<\/(?:script|style|textarea|title)\s*>|<\/?[a-z](?:"[^"]*"|'[^']*'|[^'">])*>/gi;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function localTarget(tag) {
  const href = [...tag.slice(2, -1).matchAll(ATTRIBUTE)].find(([, name]) => name.toLowerCase() === "href");
  if (!href) return null;
  const value = (href[2] ?? href[3] ?? href[4] ?? "")
    .replace(/&#(?:x([a-f\d]+)|(\d+));?/gi, (entity, hex, decimal) => {
      const code = hex ? parseInt(hex, 16) : Number(decimal);
      return code <= 0x7f ? String.fromCharCode(code) : entity;
    })
    .replace(/[\t\r\n]/g, "").trim();
  const match = /^http:\/\/(127\.0\.0\.1|localhost):(\d+)(?=[/?#\\]|$)/i.exec(value);
  const port = Number(match?.[2]);
  return port > 0 && port <= 65535 ? { port, host: match[1].toLowerCase() } : null;
}

function findLocalLinks(html) {
  const links = [];
  let open = null;
  for (const { 0: tag, index } of html.matchAll(TAG)) {
    if (/^<a(?=[\s>])/i.test(tag)) {
      const target = localTarget(tag);
      open = target && { ...target, start: index, contentStart: index + tag.length };
    } else if (open && /^<\/a\s*>$/i.test(tag)) {
      links.push({ ...open, contentEnd: index, end: index + tag.length });
      open = null;
    }
  }
  return links;
}

function portAnswers(port, host) {
  return new Promise((resolve) => {
    const socket = connect({ port, host, autoSelectFamily: true });
    const timer = setTimeout(() => finish(false), 400);
    function finish(up) {
      clearTimeout(timer);
      socket.destroy();
      resolve(up);
    }
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function probeAndMarkLocalLinks(pages) {
  const linksByPage = pages.map(({ html }) => findLocalLinks(html));
  const targets = new Map();
  for (const { port, host } of linksByPage.flat()) {
    if (!targets.has(port) || host === "127.0.0.1") targets.set(port, host);
  }
  const results = new Map(await Promise.all([...targets].map(async ([port, host]) =>
    [port, await portAnswers(port, host)])));
  const summary = { portsUp: 0, portsDown: 0, linksUp: 0, linksDown: 0 };
  for (const up of results.values()) summary[up ? "portsUp" : "portsDown"]++;

  for (const [index, { html }] of pages.entries()) {
    let cursor = 0;
    const chunks = [];
    for (const { port, start, contentStart, contentEnd, end } of linksByPage[index]) {
      const up = results.get(port);
      summary[up ? "linksUp" : "linksDown"]++;
      if (up) continue;
      chunks.push(html.slice(cursor, start), html.slice(contentStart, contentEnd),
        ' <span class="chip warn local-link-down">not running</span>');
      cursor = end;
    }
    if (cursor) pages[index].html = chunks.join("") + html.slice(cursor);
  }
  return summary;
}
