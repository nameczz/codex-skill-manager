import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureSkillDependenciesInstalled } from "../src/skillDependencies.js";

describe("ensureSkillDependenciesInstalled", () => {
  it("uses yarn when yarn.lock exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-deps-yarn-"));
    const toolDir = path.join(root, "bin");
    const skillDir = path.join(root, "skill");
    const previousPath = process.env.PATH;
    const marker = path.join(skillDir, "install-called.txt");

    try {
      await mkdir(toolDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await createFakeManager(toolDir, "yarn", `#!/bin/sh\nmkdir -p "$PWD/node_modules"\necho "yarn install called" > "${marker}"\nexit 0\n`);
      process.env.PATH = `${toolDir}:${previousPath}`;

      await writeFile(path.join(skillDir, "package.json"), "{}\n", "utf8");
      await writeFile(path.join(skillDir, "yarn.lock"), "lock", "utf8");

      const result = await ensureSkillDependenciesInstalled(skillDir);
      const markerExists = existsSync(marker);

      expect(result.status).toBe("installed");
      expect(result.packageManager).toBe("yarn");
      expect(result.command).toBe("yarn install");
      expect(markerExists).toBe(true);
    } finally {
      process.env.PATH = previousPath;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips when node_modules already exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-deps-skip-"));
    const skillDir = path.join(root, "skill");

    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "package.json"), "{}\n", "utf8");
    await mkdir(path.join(skillDir, "node_modules"), { recursive: true });

    const result = await ensureSkillDependenciesInstalled(skillDir);

    expect(result.status).toBe("skipped-existing-node-modules");
    expect(result.packageManager).toBeNull();
    expect(result.command).toBe("");
    await rm(root, { recursive: true, force: true });
  });

  it("falls back to npm when no lockfile exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-deps-npm-"));
    const toolDir = path.join(root, "bin");
    const skillDir = path.join(root, "skill");
    const previousPath = process.env.PATH;
    const marker = path.join(skillDir, "install-called.txt");

    try {
      await mkdir(toolDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await createFakeManager(toolDir, "npm", `#!/bin/sh\nmkdir -p "$PWD/node_modules"\necho "npm install called" > "${marker}"\nexit 0\n`);
      process.env.PATH = `${toolDir}:${previousPath}`;

      await writeFile(path.join(skillDir, "package.json"), "{}\n", "utf8");

      const result = await ensureSkillDependenciesInstalled(skillDir);
      const markerExists = existsSync(marker);

      expect(result.status).toBe("installed");
      expect(result.packageManager).toBe("npm");
      expect(result.command).toBe("npm install");
      expect(markerExists).toBe(true);
    } finally {
      process.env.PATH = previousPath;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails with a clear error when install command exits non-zero", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-deps-fail-"));
    const toolDir = path.join(root, "bin");
    const skillDir = path.join(root, "skill");
    const previousPath = process.env.PATH;

    try {
      await mkdir(toolDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await createFakeManager(toolDir, "npm", `#!/bin/sh\necho "boom" 1>&2\nexit 1\n`);
      process.env.PATH = `${toolDir}:${previousPath}`;

      await writeFile(path.join(skillDir, "package.json"), "{}\n", "utf8");
      await writeFile(path.join(skillDir, "package-lock.json"), "{}\n", "utf8");

      await expect(ensureSkillDependenciesInstalled(skillDir)).rejects.toThrow("Dependency install failed");
    } finally {
      process.env.PATH = previousPath;
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createFakeManager(toolDir: string, name: string, body: string): Promise<void> {
  const commandPath = path.join(toolDir, name);
  await writeFile(commandPath, body, "utf8");
  chmodSync(commandPath, 0o755);
}
