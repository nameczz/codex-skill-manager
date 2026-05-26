import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LocalConfig } from "./types.js";
import {
  configFilePath,
  expandHome,
  getDefaultCacheDir,
  getDefaultAgentsSkillsDir,
  getDefaultCodexSkillsDir,
  getDefaultConfigDir,
  getDefaultSyncRepo,
  type PathOptions
} from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json.js";

export type InitConfigOptions = PathOptions & {
  syncRepo?: string;
  codexSkillsDir?: string;
  agentsSkillsDir?: string;
  cacheDir?: string;
  force?: boolean;
};

export async function createLocalConfig(options: InitConfigOptions = {}): Promise<LocalConfig> {
  const configDir = getDefaultConfigDir(options);
  const now = new Date().toISOString();
  const filePath = configFilePath(configDir);
  const existing = existsSync(filePath) ? await loadLocalConfig(options) : null;

  if (existsSync(filePath) && !options.force) {
    return existing as LocalConfig;
  }

  const config: LocalConfig = {
    schemaVersion: 1,
    syncRepo: resolveUserPath(options.syncRepo ?? getDefaultSyncRepo(options), options),
    codexSkillsDir: resolveUserPath(options.codexSkillsDir ?? getDefaultCodexSkillsDir(options), options),
    agentsSkillsDir: resolveUserPath(options.agentsSkillsDir ?? existing?.agentsSkillsDir ?? getDefaultAgentsSkillsDir(options), options),
    cacheDir: resolveUserPath(options.cacheDir ?? getDefaultCacheDir(options), options),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await mkdir(config.cacheDir, { recursive: true });
  await writeJsonFile(filePath, config);
  return config;
}

export async function loadLocalConfig(options: PathOptions = {}): Promise<LocalConfig> {
  const filePath = configFilePath(getDefaultConfigDir(options));

  if (!existsSync(filePath)) {
    throw new Error(`No config found at ${filePath}. Run "skill-manager init" first.`);
  }

  const config = await readJsonFile<LocalConfig>(filePath);
  if (config.schemaVersion !== 1) {
    throw new Error(`Unsupported config schema version in ${filePath}.`);
  }

  return {
    ...config,
    agentsSkillsDir: config.agentsSkillsDir ?? getDefaultAgentsSkillsDir(options)
  };
}

export async function tryLoadLocalConfig(options: PathOptions = {}): Promise<LocalConfig | null> {
  const filePath = configFilePath(getDefaultConfigDir(options));
  if (!existsSync(filePath)) {
    return null;
  }

  return loadLocalConfig(options);
}

function resolveUserPath(input: string, options: InitConfigOptions): string {
  return path.resolve(expandHome(input, options.homeDir));
}
