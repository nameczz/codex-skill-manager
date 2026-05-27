import type { LocalConfig, LocalSkillSource } from "./types.js";
import { installRepoSkill } from "./installSkill.js";
import { buildStatusReport } from "./status.js";
import { validateSkillId } from "./paths.js";
import type { InstallRepoSkillResult } from "./types.js";

export type UpdateLocalOptions = {
  source?: LocalSkillSource;
};

export async function updateLocalSkill(config: LocalConfig, skillId: string, options: UpdateLocalOptions = {}): Promise<InstallRepoSkillResult> {
  const id = validateSkillId(skillId);
  const report = await buildStatusReport(config);
  const target = report.managed.find((skill) => skill.id === id);
  if (!target) {
    throw new Error(`Managed skill not found: ${id}`);
  }

  if (target.syncState === "conflict") {
    throw new Error(`Cannot update ${id}: conflict must be resolved manually.`);
  }

  if (target.syncState !== "missing_local" && target.syncState !== "repo_modified") {
    throw new Error(`Cannot update ${id}: no repo diff to apply.`);
  }

  return installRepoSkill(config, id, { force: true, source: options.source });
}
