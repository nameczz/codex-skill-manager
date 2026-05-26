import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureRepoMetadata } from "../src/metadata.js";
import { readUsageEvents, getLastUsageBySkill, recordUsageEvent } from "../src/usage.js";

describe("usage events", () => {
  it("records and reads JSONL usage events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-usage-"));
    const syncRepo = path.join(root, "repo");
    const now = new Date().toISOString();
    const config = {
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir: path.join(root, "codex"),
      agentsSkillsDir: path.join(root, "agents"),
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    } as const;

    await ensureRepoMetadata(syncRepo);

    await recordUsageEvent(config, "foo", { invokedAt: "2026-01-01T00:00:00.000Z" });
    await recordUsageEvent(config, "foo", { invokedAt: "2026-01-02T00:00:00.000Z" });
    await recordUsageEvent(config, "bar", { invokedAt: "2026-01-03T00:00:00.000Z" });

    const events = await readUsageEvents(syncRepo);
    expect(events).toHaveLength(3);
    expect(events[1]).toEqual({
      skillId: "foo",
      invokedAt: "2026-01-02T00:00:00.000Z",
      source: "record"
    });
  });

  it("parses the most recent usage event per skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-usage-last-"));
    const syncRepo = path.join(root, "repo");
    const now = new Date().toISOString();
    const config = {
      schemaVersion: 1,
      syncRepo,
      codexSkillsDir: path.join(root, "codex"),
      agentsSkillsDir: path.join(root, "agents"),
      cacheDir: path.join(root, "cache"),
      createdAt: now,
      updatedAt: now
    } as const;

    await ensureRepoMetadata(syncRepo);
    await recordUsageEvent(config, "alpha", { invokedAt: "2026-01-01T00:00:00.000Z" });
    await recordUsageEvent(config, "alpha", { invokedAt: "2026-01-04T00:00:00.000Z" });
    await recordUsageEvent(config, "beta", { invokedAt: "2026-01-03T00:00:00.000Z" });

    const last = await getLastUsageBySkill(syncRepo, ["alpha", "beta", "gamma"]);
    expect(last.get("alpha")).toBe("2026-01-04T00:00:00.000Z");
    expect(last.get("beta")).toBe("2026-01-03T00:00:00.000Z");
    expect(last.get("gamma")).toBeNull();
  });

  it("ignores malformed usage event rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-usage-malformed-"));
    const syncRepo = path.join(root, "repo");
    await ensureRepoMetadata(syncRepo);
    await mkdir(syncRepo, { recursive: true });
    await writeFile(path.join(syncRepo, "metadata", "usage-events.jsonl"), `\nnot-json-line\n`, "utf8");

    const events = await readUsageEvents(syncRepo);
    expect(events).toEqual([]);
  });
});
