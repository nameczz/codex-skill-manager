import { mkdir } from "node:fs/promises";
import type { InitConfigOptions } from "./config.js";
import { createLocalConfig } from "./config.js";
import { ensureRepoMetadata } from "./metadata.js";
import { ensureGitRepository } from "./git.js";

export async function initialize(options: InitConfigOptions = {}) {
  const config = await createLocalConfig(options);
  await mkdir(config.codexSkillsDir, { recursive: true });
  await mkdir(config.agentsSkillsDir, { recursive: true });
  await ensureRepoMetadata(config.syncRepo);
  const gitInitialized = await ensureGitRepository(config.syncRepo);
  return { config, gitInitialized };
}
