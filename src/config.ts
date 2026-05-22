import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

interface ResourceConfig {
  methods?: Record<string, string>;
  rename?: string;
  subresources?: Record<string, ResourceConfig>;
}

interface IngotConfig {
  name?: string;
  package?: string;
  version?: string;
  baseUrl?: string;
  resources?: Record<string, ResourceConfig>;
  ignore?: string[];
}

async function loadConfig(path: string): Promise<IngotConfig> {
  const raw = await readFile(path, "utf-8");
  if (path.endsWith(".json")) {
    return JSON.parse(raw) as IngotConfig;
  }
  return parseYaml(raw) as IngotConfig;
}

function applyConfig(
  config: IngotConfig,
  spec: { name: string; version: string; baseUrl: string; groups: Array<{ name: string; operations: Array<{ id: string }> }> },
): void {
  if (config.name) spec.name = config.name;
  if (config.version) spec.version = config.version;
  if (config.baseUrl) spec.baseUrl = config.baseUrl;

  if (config.ignore?.length) {
    const ignoreSet = new Set(config.ignore);
    spec.groups = spec.groups.filter((g) => !ignoreSet.has(g.name));
  }

  if (config.resources) {
    for (const group of spec.groups) {
      const resourceCfg = config.resources[group.name];
      if (!resourceCfg) continue;
      if (resourceCfg.rename) group.name = resourceCfg.rename;
      if (resourceCfg.methods) {
        for (const op of group.operations) {
          const renamed = resourceCfg.methods[op.id];
          if (renamed) op.id = renamed;
        }
      }
    }
  }
}

export { loadConfig, applyConfig };
export type { IngotConfig, ResourceConfig };
