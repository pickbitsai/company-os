// Explicit installers for agent skills bundled with Company OS.
//
// npm install must never mutate a consumer's repository. A user opts in through the CLI, and an
// existing local skill always wins: the installer keeps it rather than overwriting custom work.

import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const BUNDLED_SKILLS = [
  {
    id: "portfolio-gtm",
    name: "company-os-portfolio-gtm",
    description: "Create and maintain an evidence-led portfolio GTM plan.",
  },
  {
    id: "intranet-maintainer",
    name: "company-os-intranet-maintainer",
    description: "Keep repository-owned intranet indexes current after changing their registered sources.",
  },
];

/**
 * Read a bundled skill's text. This is the ONLY source for it.
 *
 * The intranet maintainer skill used to exist twice: once as this file on disk, and once as a
 * template literal inside intranet.mjs that `install-agent-rules` wrote out. The two had already
 * drifted — seven numbered steps against six, and different wording for what the agent is
 * forbidden to do. A skill file is a behavioural contract, so two versions means the agent reading
 * the installed copy and the human reviewing the bundled one are working from different rules.
 */
export function readBundledSkill(id) {
  const skill = BUNDLED_SKILLS.find((item) => item.id === id || item.name === id);
  if (!skill) throw new Error(`unknown skill "${id}" — expected one of ${BUNDLED_SKILLS.map((s) => s.id).join(", ")}`);
  return readFileSync(join(PACKAGE_ROOT, "skills", skill.name, "SKILL.md"), "utf8");
}

export function installBundledSkill(id, { targetRoot = process.cwd() } = {}) {
  const skill = BUNDLED_SKILLS.find((item) => item.id === id || item.name === id);
  if (!skill) {
    throw new Error(`unknown skill "${id}" — expected one of ${BUNDLED_SKILLS.map((item) => item.id).join(", ")}`);
  }
  const source = join(PACKAGE_ROOT, "skills", skill.name);
  if (!existsSync(source)) throw new Error(`bundled skill is missing: ${source}`);
  const target = join(resolve(targetRoot), ".claude", "skills", skill.name);
  if (existsSync(target)) return { ...skill, action: "kept", target };
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, errorOnExist: true });
  return { ...skill, action: "created", target };
}
