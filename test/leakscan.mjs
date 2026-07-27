#!/usr/bin/env node
// Leak scan — the gate between this repo and the private company it was extracted from.
//
// Runs over exactly what would be published (the `files` allowlist in package.json), because
// scanning the working tree would miss the case that matters: something private sitting inside
// a directory that ships. Wired into prepublishOnly, so publishing cannot skip it.
//
// This is a blunt instrument on purpose. A false positive costs a rename; a false negative
// puts someone's ports, task names, or absolute paths on npm permanently.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

// Files whose whole purpose is to talk about the project that produced this one.
const ALLOWED_FILES = new Set(["LICENSE", "README.md"]);

// The publisher's own identity is not a leak: this package is named and hosted by pickbitsai,
// so those exact strings are expected anywhere. Removed before matching so that any OTHER
// mention of the private company still trips the rule.
// An `@pickbitsai/<name>` npm specifier is a PUBLIC package identifier by construction — a scope
// is how strangers install the thing. Allowing the whole scope (rather than listing siblings one
// at a time) is why the optional `@pickbitsai/enview` peer dependency can be named in source.
// It is still narrow: a bare "PickBits" or "pickbits-daily" outside a package specifier trips.
const OWN_IDENTITY = [
  /@pickbitsai\/[\w.-]+/g,
  /(?:github\.com|npmjs\.com\/package)\/(?:@)?pickbitsai(?:\/[\w.-]+)?/g,
  /PickBits\.AI(?= |$|\.)/g,
];
const stripOwnIdentity = (line) => OWN_IDENTITY.reduce((acc, re) => acc.replace(re, ""), line);
const SKIP_DIRS = new Set(["node_modules", ".git"]);
// Text-ish files only; a .webp cannot leak a task name in a way grep would find.
const TEXT_EXT = new Set([".mjs", ".js", ".cjs", ".json", ".md", ".html", ".css", ".txt", ".yml", ".yaml", ""]);

const RULES = [
  // The organisation this was extracted from. Allowed in LICENSE/README attribution only.
  { id: "pickbits", re: /pickbits/i, note: "PickBits identifier" },
  { id: "cyberhawk", re: /cyberhawk/i, note: "private product name" },
  // Absolute Windows or Unix-home paths.
  { id: "abs-win-path", re: /[A-Za-z]:\\(?:new|Users)\b/i, note: "absolute Windows path" },
  { id: "abs-home-path", re: /\/(?:Users|home)\/[a-z0-9._-]+\//i, note: "absolute home path" },
  // Credentials and tokens.
  { id: "secret-name", re: /\b(?:BLOTATO|ELEVENLABS|REPLICATE|OPENAI|ANTHROPIC)[A-Z_]*(?:KEY|TOKEN|SECRET)\b/, note: "named credential" },
  { id: "api-key-literal", re: /\b(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})/, note: "credential literal" },
  { id: "generic-secret", re: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"'{}\s]{12,}["']/i, note: "assigned secret" },
  // A private manifest smuggled in. Matches a literal schema id under someone ELSE's prefix
  // ("acme.ai-governance/v1"), which means real config got committed. Excludes the templated
  // `${config.schemaPrefix}.…` the generator builds at runtime, and this package's own
  // "company-os." default used by the example fixture.
  {
    id: "foreign-schema-id",
    re: /["'](?!company-os\.)[\w.-]+\.(?:ai-governance|project-status)\/v1["']/,
    note: "schema id under a non-default prefix — a real config may have been committed",
  },
];

// Ports and task names from a private manifest, if one happens to be on this machine. This turns
// the scan from "known bad strings" into "this specific company's identifiers", which is the
// check that actually protects the extraction.
function privateIdentifiers() {
  const ids = [];
  for (const candidate of [join(ROOT, "..", "ops-index", "engines.json")]) {
    let manifest;
    try { manifest = JSON.parse(readFileSync(candidate, "utf8")); } catch { continue; }
    for (const eng of manifest.engines || []) {
      for (const server of eng.servers || []) {
        if (server.port) ids.push({ id: "private-port", re: new RegExp(`\\b${server.port}\\b`), note: `port ${server.port} from a private manifest` });
      }
      for (const node of eng.nodes || []) {
        for (const task of node.tasks || []) {
          ids.push({ id: "private-task", re: new RegExp(task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), note: `task name "${task}"` });
        }
      }
    }
  }
  return ids;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Resolve the publish allowlist into concrete files.
const staged = [];
for (const pattern of pkg.files) {
  const target = join(ROOT, pattern.replace(/\/$/, ""));
  try {
    if (statSync(target).isDirectory()) staged.push(...walk(target));
    else staged.push(target);
  } catch {
    console.warn(`files entry does not exist: ${pattern}`);
  }
}

const rules = [...RULES, ...privateIdentifiers()];
const findings = [];
let scanned = 0;

for (const file of staged) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const base = rel.split("/").pop();
  if (!TEXT_EXT.has(extname(file))) continue;
  // Everything in the publish set is scanned, generated output included. Skipping files because
  // they are "just build output" would leave shipped bytes unchecked, which is the whole thing
  // this script exists to prevent.
  scanned++;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const rule of rules) {
    if (ALLOWED_FILES.has(base) && (rule.id === "pickbits" || rule.id === "abs-win-path")) continue;
    lines.forEach((line, i) => {
      const subject = rule.id === "pickbits" ? stripOwnIdentity(line) : line;
      if (rule.re.test(subject)) {
        findings.push({ rel, line: i + 1, rule, text: line.trim().slice(0, 120) });
      }
    });
  }
}

console.log(`leakscan: ${scanned} publishable text files, ${rules.length} rules`);
if (!findings.length) {
  console.log("PASS — nothing private in the publish set.");
  process.exit(0);
}

for (const f of findings) {
  console.log(`\n${f.rel}:${f.line}  [${f.rule.id}] ${f.rule.note}\n  ${f.text}`);
}
console.log(`\nFAIL — ${findings.length} finding(s). Remove them, or narrow the package.json "files" allowlist.`);
process.exit(1);
