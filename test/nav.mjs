import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, normalizeConfig } from "../src/index.mjs";
import { resolveGroup } from "../src/group-nav.mjs";

async function fixture(options, satellites = []) {
  const root = mkdtempSync(join(tmpdir(), "company-os-nav-"));
  try {
    writeFileSync(join(root, "engines.json"), JSON.stringify({ engines: [], satellites }));
    const log = [];
    const result = await build(normalizeConfig({ scheduler: "none", ...options }, root), {
      log: (message) => log.push(message),
    });
    return { html: readFileSync(join(root, "index.html"), "utf8"), result, log };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const groupTable = {
  defaultGroup: "home",
  groups: ["machine", "home", "more"],
  sectionGroups: {
    schedules: "machine", "company-floor": "home", projects: "more", satellites: "more", "refresh-snapshot": "more",
  },
};

async function listen(server) {
  // Port 0 asks the OS to allocate a temporary loopback test port.
  const ready = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await ready;
  return server.address().port;
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function testNavigation(test, legacyHtml) {
  await test("group navigation emits section assignments, a More tab and progressive enhancement", async () => {
    const { html } = await fixture({
      nav: {
        defaultGroup: "home",
        groups: [
          { id: "machine", label: "Machine", sections: ["schedules", "not-rendered"] },
          { id: "home", label: "Home", sections: ["company-floor"] },
        ],
      },
    });
    const tabs = [...html.matchAll(/<a href="#g-([^"]+)" data-group="[^"]+">([^<]+)<\/a>/g)];
    assert.deepEqual(tabs.map(([, id, label]) => [id, label]),
      [["machine", "Machine"], ["home", "Home"], ["more", "More"]]);
    assert.ok(html.includes(JSON.stringify(groupTable)));
    for (const [id, group] of Object.entries(groupTable.sectionGroups)) {
      const tag = [...html.matchAll(/<(?:details|section)\b[^>]*>/g)]
        .map(([markup]) => markup).find((markup) => markup.includes(`id="${id}"`));
      assert.ok(tag?.includes(`data-nav-group="${group}"`), id);
      assert.doesNotMatch(tag, /\shidden(?:[=\s>])/);
    }
    assert.match(html, /<header class="company-hero" data-nav-group="home">/);
    const schedules = html.match(/<details [^>]*id="schedules"[^>]*>/)[0];
    const satellites = html.match(/<details [^>]*id="satellites"[^>]*>/)[0];
    assert.match(schedules, /\sopen>/);
    assert.doesNotMatch(satellites, /\sopen>/);
    assert.match(html, /section\.hidden = section\.dataset\.navGroup !== group/);
    assert.match(html, /addEventListener\("hashchange", update\)/);
  });

  await test("group hashes and legacy section hashes resolve, with a default for unknown hashes", () => {
    assert.equal(resolveGroup("#schedules", groupTable), "machine");
    assert.equal(resolveGroup("#g-machine", groupTable), "machine");
    assert.equal(resolveGroup("#refresh%2Dsnapshot", groupTable), "more");
    for (const hash of ["", "#missing", "#g-missing", "#constructor", "#%invalid"]) {
      assert.equal(resolveGroup(hash, groupTable), "home");
    }
  });

  await test("without groups the Acme navigation is byte-identical", () => {
    const expected = '<div class="company-navbar"><nav class="company-nav" aria-label="Company navigation"><div class="brand-lockup"><span class="brand-mark">AC</span> Acme Company OS</div>\n'
      + '  <div class="company-links"><a href="#company-floor">Company floor</a><a href="#projects">Project pulse</a><a href="#schedules">Schedules</a><a href="#docs">Docs</a><a href="#gtm">GTM</a><a href="#satellites">Network</a></div></nav></div>';
    assert.equal(legacyHtml.match(/<div class="company-navbar">[\s\S]*?<\/nav><\/div>/)?.[0], expected);
  });

  await test("local probes are opt-in, deduplicated by port and mark down links as text", async () => {
    let connections = 0;
    const running = createServer((socket) => {
      connections++;
      socket.end();
    });
    const temporary = createServer();
    const up = await listen(running);
    try {
      const down = await listen(temporary);
      await close(temporary);
      const upUrl = `http://127.0.0.1:${up}/ready`;
      const aliasUrl = `http://localhost:${up}/`;
      const downUrl = `http://localhost:${down}/missing`;
      const untouchedUrl = `https://localhost:${down}/secure`;
      const satellites = [upUrl, aliasUrl, downUrl, downUrl, untouchedUrl].map((url, index) =>
        ({ id: `fixture-${index}`, name: `Fixture ${index}`, url }));
      const disabled = await fixture({}, satellites);
      assert.equal(disabled.result.localLinks, undefined);
      assert.ok(!disabled.log.some((message) => message.startsWith("Local links:")));
      assert.equal(connections, 0);
      assert.ok(disabled.html.includes(`<a href="${downUrl}">`));
      assert.doesNotMatch(disabled.html, /local-link-down/);

      const enabled = await fixture({ probeLocalLinks: true }, satellites);
      assert.equal(connections, 1);
      assert.deepEqual(enabled.result.localLinks, { portsUp: 1, portsDown: 1, linksUp: 2, linksDown: 2 });
      assert.ok(enabled.log.includes("Local links: 2 up, 2 down across 1 up and 1 down ports"));
      for (const url of [upUrl, aliasUrl, untouchedUrl]) assert.ok(enabled.html.includes(`<a href="${url}">`));
      assert.ok(!enabled.html.includes(`href="${downUrl}"`));
      assert.equal(enabled.html.split(`${downUrl} <span class="chip warn local-link-down">not running</span>`).length, 3);
    } finally {
      await close(running);
    }
  });
}
