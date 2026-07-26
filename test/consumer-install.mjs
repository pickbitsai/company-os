import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = mkdtempSync(join(tmpdir(), "company-os-consumer-"));
const consumer = join(sandbox, "consumer");
const env = { ...process.env, NPM_CONFIG_CACHE: join(sandbox, "npm-cache") };
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "npm_execpath is required; run this check through npm");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function runNpm(args, cwd) {
  return run(process.execPath, [npmCli, ...args], cwd);
}

try {
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "company-os-consumer-smoke", private: true }, null, 2),
  );

  const packed = JSON.parse(
    runNpm(["pack", "--json", "--ignore-scripts", "--pack-destination", sandbox], root),
  );
  assert.equal(packed.length, 1, "npm pack should produce exactly one tarball");
  const tarball = join(sandbox, basename(packed[0].filename));
  assert.ok(existsSync(tarball), `missing packed tarball: ${tarball}`);

  runNpm(
    ["install", "--offline", "--omit=peer", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    consumer,
  );
  runNpm(["exec", "--", "company-os", "init"], consumer);
  assert.ok(existsSync(join(consumer, "company-os.config.mjs")), "CLI init did not write its config");

  writeFileSync(join(consumer, "engines.json"), JSON.stringify({ engines: [] }, null, 2));
  runNpm(["exec", "--", "company-os", "build"], consumer);
  const output = readFileSync(join(consumer, "index.html"), "utf8");
  assert.match(output, /My Company OS/);
  assert.match(output, /<b>0<\/b><span>workstations<\/span>/);

  console.log("consumer smoke passed: packed, installed, initialized, and built from a clean project");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
