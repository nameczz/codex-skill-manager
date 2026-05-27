import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copySkillDirectory } from "../src/copy.js";

describe("copySkillDirectory", () => {
  it("skips dependency and git directories when copying skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-copy-skip-"));
    const source = path.join(root, "source");
    const target = path.join(root, "target");

    await writeFileWithParents(path.join(source, "SKILL.md"), "# Skill\n");
    await writeFileWithParents(path.join(source, "scripts", "node_modules", "yaml", "bin.mjs"), "bin\n");
    await writeFileWithParents(path.join(source, ".git", "config"), "[core]\n");

    await copySkillDirectory(source, target);

    expect(existsSync(path.join(target, "SKILL.md"))).toBe(true);
    expect(existsSync(path.join(target, "scripts", "node_modules"))).toBe(false);
    expect(existsSync(path.join(target, ".git"))).toBe(false);
  });

  it("preserves safe symlinks that stay inside the skill directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-copy-safe-link-"));
    const source = path.join(root, "source");
    const target = path.join(root, "target");

    await writeFileWithParents(path.join(source, "SKILL.md"), "# Skill\n");
    await writeFileWithParents(path.join(source, "scripts", "bin.mjs"), "bin\n");
    await mkdir(path.join(source, "scripts", ".bin"), { recursive: true });
    await symlinkRelative("../bin.mjs", path.join(source, "scripts", ".bin", "tool"));

    await copySkillDirectory(source, target);

    const copiedLink = path.join(target, "scripts", ".bin", "tool");
    expect((await lstat(copiedLink)).isSymbolicLink()).toBe(true);
    expect(await readlink(copiedLink)).toBe("../bin.mjs");
  });

  it("rejects symlinks that escape the skill directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-copy-escaping-link-"));
    const source = path.join(root, "source");
    const target = path.join(root, "target");

    await writeFileWithParents(path.join(source, "SKILL.md"), "# Skill\n");
    await writeFile(path.join(root, "outside.txt"), "secret\n", "utf8");
    await symlinkRelative("../outside.txt", path.join(source, "outside"));

    await expect(copySkillDirectory(source, target)).rejects.toThrow("Refusing to copy symbolic link that escapes skill directory");
  });
});

async function writeFileWithParents(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function symlinkRelative(target: string, linkPath: string): Promise<void> {
  await symlink(target, linkPath);
}
