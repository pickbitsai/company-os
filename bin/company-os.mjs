#!/usr/bin/env node
// CLI.
//   company-os build                        # find company-os.config.mjs upward from cwd
//   company-os build --config path/to/dir   # or a direct path to a config file
//   company-os build --sites-only           # refresh publish targets only, skip the HTML
//   company-os init                         # write a starter config and empty manifest

import { existsSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import { build, findConfig, loadConfig } from "../src/index.mjs";

const args = argv.slice(2);
const command = args.find((a) => !a.startsWith("-")) || "build";

function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  const value = args[i + 1];
  return value && !value.startsWith("--") ? value : null;
}

// --config accepts a file or a directory; a directory is searched for the usual config names.
function resolveConfigPath() {
  const supplied = flag("config");
  if (!supplied) {
    const found = findConfig(cwd());
    if (!found) {
      console.error("no company-os config found. Run `company-os init`, or pass --config <path>.");
      exit(1);
    }
    return found;
  }
  const abs = resolve(supplied);
  if (!existsSync(abs)) {
    console.error(`--config path does not exist: ${abs}`);
    exit(1);
  }
  const asDir = findConfig(abs);
  if (!asDir) {
    console.error(`no config file found at or above ${abs}`);
    exit(1);
  }
  return asDir;
}

const STARTER = `// Company OS config. Docs: https://github.com/pickbitsai/company-os
export default {
  // Where your projects live. Every engine "dir" is relative to this.
  root: ".",
  manifest: "./engines.json",

  brand: {
    name: "My Company OS",
    mark: "MC",
    headline: "Six projects.<br>One living company.",
  },

  // "schtasks" (Windows) | "cron" (macOS/Linux) | "none". Omit to pick by platform.
  // scheduler: "none",

  // Optional mascot art: a directory of <engineId>.webp. Omit for the built-in CSS figures.
  // avatars: "./assets/avatars",
};
`;

const STARTER_MANIFEST = `${JSON.stringify({ engines: [] }, null, 2)}\n`;

if (command === "init") {
  const target = join(cwd(), "company-os.config.mjs");
  const manifestTarget = join(cwd(), "engines.json");
  if (existsSync(target)) {
    console.error(`refusing to overwrite ${target}`);
    exit(1);
  }
  writeFileSync(target, STARTER);
  const manifestStatus = existsSync(manifestTarget)
    ? `kept existing ${manifestTarget}`
    : (writeFileSync(manifestTarget, STARTER_MANIFEST), `wrote ${manifestTarget}`);
  console.log(`wrote ${target}\n${manifestStatus}\nNext: run \`company-os build\`.`);
  exit(0);
}

if (command !== "build") {
  console.error(`unknown command "${command}" — expected build or init`);
  exit(1);
}

const configPath = resolveConfigPath();
try {
  const config = await loadConfig(configPath);
  console.log(`company-os · config ${basename(configPath)} · manifest ${config.manifest}`);
  await build(config, { argv: args });
} catch (error) {
  console.error(`company-os build failed: ${error.message}`);
  exit(1);
}
