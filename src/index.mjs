// Public API.
//
//   import { build, loadConfig } from "@pickbitsai/company-os";
//   await build(await loadConfig("./company-os.config.mjs"));
//
// `build` takes a normalized config. If you have a raw object instead, run it through
// `normalizeConfig(raw, baseDir)` first so relative paths resolve the way a config file's would.

export { build } from "./build.mjs";
export { DEFAULT_BRAND, findConfig, loadConfig, normalizeConfig } from "./config.mjs";
export { deriveStatus, writeDerivedStatus } from "./derive-status.mjs";
export { defaultScheduler, resolveScheduler } from "./scheduler.mjs";
export { publicSnapshot } from "./publish.mjs";
export { engineScripts, scanScripts, wiredScripts } from "./scripts.mjs";
export { BUNDLED_SKILLS, installBundledSkill, readBundledSkill } from "./skills.mjs";
export {
  discoverIntranet,
  globToRegExp,
  installIntranetAgentRules,
  loadIntranetRegistry,
  loadIntranetState,
  maintainIntranet,
  writeIntranetRegistry,
} from "./intranet.mjs";
export { CSS, companyCss } from "./styles.mjs";
