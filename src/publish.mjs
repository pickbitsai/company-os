// Safe public projections of the manifest.
//
// A manifest is private by nature — it holds ports, task names, local paths and command lines.
// `publish` targets emit a deliberately narrow subset for consumption by a public website: what
// each project IS and what it consumes/produces, never how to run it.
//
// The projection is an ALLOWLIST, not a redaction pass. Adding a field to your manifest cannot
// leak it here; someone has to come and add it to this function on purpose.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Bump when the projection's SHAPE changes, so a consuming site can tell a new field apart from
// a data change. It also feeds sourceRevision, so a shape change alone republishes.
const PROJECTION_VERSION = 1;

// Second line of defence for free-text fields. `ingress`/`egress` are prose written for an
// internal audience, so they routinely mention real paths ("editions/{date}/slate.json",
// "C:\\new\\warehouse\\store"). Publishing those would leak the private layout even though the
// field itself is allowlisted. Anything that looks like a filesystem path is dropped, not
// rewritten — a half-redacted path is still a disclosure.
export function publicFacts(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value) => {
      if (/[A-Za-z]:[\\/]/.test(value)) return false;                       // C:\... or C:/...
      if (/\{date\}[\\/]|[\\/]\*\*/.test(value)) return false;              // templated dirs, globs
      // path/to/file.ext in any of the usual project file types
      return !/(?:^|\s)[\w{}.-]+[\\/](?:[\w{}.*-]+[\\/])*[\w{}.*-]+\.(?:html?|jsonl?|md|mjs|cjs|js|ps1|png|jpe?g|webp|mp4)\b/i.test(value);
    });
}

export function publicSnapshot({ manifest, config, nowIso }) {
  const engines = manifest.engines.map((eng) => ({
    id: eng.id,
    name: eng.name,
    class: eng.class,
    accent: eng.accent,
    badge: eng.avatar?.badge || null,
    station: eng.avatar?.station || null,
    role: eng.role,
    ingress: publicFacts(eng.ingress),
    egress: publicFacts(eng.egress),
    // Stage NAMES only — never the commands that implement them.
    stages: Array.isArray(eng.nodes) ? eng.nodes.map((node) => node.name).filter(Boolean) : [],
  }));
  const sourceRevision = createHash("sha256")
    .update(JSON.stringify({ projectionVersion: PROJECTION_VERSION, engines }))
    .digest("hex")
    .slice(0, 16);
  return {
    schemaVersion: `${config.schemaPrefix}.company-os/public-engines/v1`,
    projectionVersion: PROJECTION_VERSION,
    generated: true,
    generatedAt: nowIso,
    source: config.brand.manifestLabel,
    sourceRevision,
    notice: config.publishNotice,
    engines,
  };
}

export function writeSnapshots({ manifest, config, nowIso, log = console.log }) {
  if (!config.publish.length) return;
  const snapshot = publicSnapshot({ manifest, config, nowIso });

  for (const target of config.publish) {
    const dir = target.dir;
    const label = target.label || dir;
    const formats = target.formats || ["json", "js"];
    const jsonPath = join(dir, target.jsonName || "company-os.json");
    const jsPath = join(dir, target.jsName || "company-os.js");
    mkdirSync(dir, { recursive: true });

    // Skip rewriting when only the timestamp would change — otherwise every build dirties the
    // consuming site's git tree and buries real manifest changes in the noise.
    let unchanged = false;
    if (existsSync(jsonPath)) {
      try {
        const previous = JSON.parse(readFileSync(jsonPath, "utf8"));
        unchanged = previous.schemaVersion === snapshot.schemaVersion
          && previous.sourceRevision === snapshot.sourceRevision;
      } catch {}
    }
    if (unchanged && (!formats.includes("js") || existsSync(jsPath))) {
      log(`unchanged ${label}`);
      continue;
    }

    if (formats.includes("json")) writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    if (formats.includes("js")) {
      const globalName = target.globalName || "COMPANY_OS";
      writeFileSync(jsPath, `${target.jsHeader || `/* ${config.publishNotice} */`}\nwindow.${globalName} = ${JSON.stringify(snapshot, null, 2)};\n`);
    }
    log(`wrote ${label}`);
  }
}
