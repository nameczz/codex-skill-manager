import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  codexHooksPath,
  extractSkillIdsFromText,
  getUsageHookStatus,
  installUsageHook,
  recordSkillMentionsFromHookInput,
  removeUsageHook
} from "../src/codexHook.js";
import { createLocalConfig } from "../src/config.js";
import { ensureRepoMetadata } from "../src/metadata.js";
import { readUsageEvents } from "../src/usage.js";
import type { LocalConfig } from "../src/types.js";

describe("codex hook integration", () => {
  it("extracts configured Codex and Agents skill paths from prompts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-hook-extract-"));
    const config = configFor(root);
    const prompt = [
      `Use [$baoyu-comic](${config.codexSkillsDir}/baoyu-comic/SKILL.md) now.`,
      `Then [$autoplan](${config.codexSkillsDir}/gstack/autoplan/SKILL.md).`,
      `Also see ${config.agentsSkillsDir}/klay-writer/SKILL.md.`,
      "/Users/example/.codex/plugins/cache/openai-bundled/browser/skills/browser/SKILL.md"
    ].join("\n");

    expect(extractSkillIdsFromText(prompt, config)).toEqual(["baoyu-comic", "gstack/autoplan", "klay-writer"]);
  });

  it("installs, updates, and removes only the Skill Manager UserPromptSubmit hook", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-hook-install-"));
    const homeDir = path.join(root, "home");
    const hooksPath = codexHooksPath({ homeDir });
    const config = configFor(root);

    await mkdir(path.dirname(hooksPath), { recursive: true });
    await writeFile(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [{ type: "command", command: "node /keep/me.js", timeout: 1, statusMessage: "Keep me" }]
              }
            ],
            Stop: [{ hooks: [{ type: "command", command: "node /stop.js" }] }]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const first = await installUsageHook(config, { homeDir, command: "node /tool-a.js record-hook" });
    expect(first.installed).toBe(true);
    expect(first.needsUpdate).toBe(false);

    const second = await installUsageHook(config, { homeDir, command: "node /tool-b.js record-hook" });
    expect(second.installed).toBe(true);
    expect(second.installedCommand).toBe("node /tool-b.js record-hook");

    const raw = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }>; Stop: unknown[] };
    };
    const commands = raw.hooks.UserPromptSubmit.flatMap((group) => group.hooks.map((hook) => hook.command));
    expect(commands).toEqual(["node /keep/me.js", "node /tool-b.js record-hook"]);
    expect(raw.hooks.Stop).toHaveLength(1);

    const removed = await removeUsageHook(config, { homeDir, command: "node /tool-b.js record-hook" });
    expect(removed.installed).toBe(false);
    const afterRemove = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(afterRemove.hooks.UserPromptSubmit.flatMap((group) => group.hooks.map((hook) => hook.command))).toEqual(["node /keep/me.js"]);
  });

  it("records skill mentions from Codex UserPromptSubmit hook input", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-hook-record-"));
    const configDir = path.join(root, "config");
    const config = await createLocalConfig({
      syncRepo: path.join(root, "repo"),
      codexSkillsDir: path.join(root, "codex-skills"),
      agentsSkillsDir: path.join(root, "agents-skills"),
      cacheDir: path.join(root, "cache"),
      env: { CSM_CONFIG_DIR: configDir } as NodeJS.ProcessEnv,
      force: true
    });
    await ensureRepoMetadata(config.syncRepo);

    const result = await recordSkillMentionsFromHookInput(
      {
        hook_event_name: "UserPromptSubmit",
        prompt: `Please use [$foo](${config.codexSkillsDir}/foo/SKILL.md) and [$bar](${config.agentsSkillsDir}/bar/SKILL.md).`
      },
      { env: { CSM_CONFIG_DIR: configDir } as NodeJS.ProcessEnv }
    );

    expect(result).toEqual({ skillIds: ["bar", "foo"], recorded: 2 });
    const events = await readUsageEvents(config.syncRepo);
    expect(events.map((event) => event.skillId).sort()).toEqual(["bar", "foo"]);
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
