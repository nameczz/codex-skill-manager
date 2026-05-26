import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureRepoMetadata } from "../src/metadata.js";

describe("repo metadata", () => {
  it("ignores local Skill Manager cache inside the sync repo", async () => {
    const syncRepo = await mkdtemp(path.join(tmpdir(), "csm-metadata-"));

    await ensureRepoMetadata(syncRepo);

    await expect(readFile(path.join(syncRepo, ".gitignore"), "utf8")).resolves.toContain(".codex-skill-manager/");
  });

  it("preserves existing gitignore entries", async () => {
    const syncRepo = await mkdtemp(path.join(tmpdir(), "csm-metadata-existing-"));
    await mkdir(syncRepo, { recursive: true });
    await writeFile(path.join(syncRepo, ".gitignore"), "node_modules/\n", "utf8");

    await ensureRepoMetadata(syncRepo);

    await expect(readFile(path.join(syncRepo, ".gitignore"), "utf8")).resolves.toBe(
      "node_modules/\n.codex-skill-manager/\n"
    );
  });
});
