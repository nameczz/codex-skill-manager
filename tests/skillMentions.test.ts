import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractSkillFilePathIdsFromText, extractSkillIdsFromText } from "../src/skillMentions.js";
import type { LocalConfig } from "../src/types.js";

describe("skill mention extraction", () => {
  it("extracts configured Codex and Agents skill paths from prompts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-mention-extract-"));
    const config = configFor(root);
    const prompt = [
      `Use [$baoyu-comic](${config.codexSkillsDir}/baoyu-comic/SKILL.md) now.`,
      `Then [$autoplan](${config.codexSkillsDir}/gstack/autoplan/SKILL.md).`,
      `Also see ${config.agentsSkillsDir}/klay-writer/SKILL.md.`,
      "/Users/example/.codex/plugins/cache/openai-bundled/browser/skills/browser/SKILL.md"
    ].join("\n");

    expect(extractSkillIdsFromText(prompt, config)).toEqual(["baoyu-comic", "gstack/autoplan", "klay-writer"]);
  });

  it("extracts dollar-prefixed installed skill mentions from prompts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-mention-dollar-"));
    const config = configFor(root);
    await mkdir(path.join(config.codexSkillsDir, "baoyu-comic"), { recursive: true });
    await writeFile(path.join(config.codexSkillsDir, "baoyu-comic", "SKILL.md"), "# baoyu-comic\n", "utf8");

    const prompt = "Try $baoyu-comic and ignore $HOME plus $missing-skill.";

    expect(extractSkillIdsFromText(prompt, config)).toEqual(["baoyu-comic"]);
  });

  it("extracts only concrete SKILL.md paths for tool-trace usage", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-mention-path-only-"));
    const config = configFor(root);
    await mkdir(path.join(config.codexSkillsDir, "baoyu-comic"), { recursive: true });
    await writeFile(path.join(config.codexSkillsDir, "baoyu-comic", "SKILL.md"), "# baoyu-comic\n", "utf8");

    const prompt = `Try $baoyu-comic and sed -n '1,80p' ${config.codexSkillsDir}/baoyu-comic/SKILL.md.`;

    expect(extractSkillFilePathIdsFromText(prompt, config)).toEqual(["baoyu-comic"]);
  });
});

function configFor(root: string): LocalConfig {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    syncRepo: path.join(root, "repo"),
    codexSkillsDir: path.join(root, "codex-skills"),
    agentsSkillsDir: path.join(root, "agents-skills"),
    cacheDir: path.join(root, "cache"),
    createdAt: now,
    updatedAt: now
  };
}
