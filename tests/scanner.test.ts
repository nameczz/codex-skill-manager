import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanSkills } from "../src/scanner.js";

describe("scanSkills", () => {
  it("treats each top-level skill folder as one managed unit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-scan-"));
    await writeSkill(path.join(root, "gstack"), "gstack");
    await writeSkill(path.join(root, "gstack", "autoplan"), "autoplan");
    await writeSkill(path.join(root, "simple"), "simple");

    const skills = await scanSkills(root, "codex");

    expect(skills.map((skill) => skill.id)).toEqual(["gstack", "simple"]);
    expect(skills.find((skill) => skill.id === "gstack")?.path).toBe(path.join(root, "gstack"));
  });

  it("hashes nested files as part of the top-level folder", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-scan-hash-"));
    await writeSkill(path.join(root, "gstack"), "gstack");
    await writeSkill(path.join(root, "gstack", "autoplan"), "autoplan");

    const before = await scanSkills(root, "codex");
    await writeFile(path.join(root, "gstack", "autoplan", "notes.md"), "changed\n", "utf8");
    const after = await scanSkills(root, "codex");

    expect(before[0]?.id).toBe("gstack");
    expect(after[0]?.id).toBe("gstack");
    expect(after[0]?.hash).not.toBe(before[0]?.hash);
  });
});

async function writeSkill(skillDir: string, name: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n# ${name}\n`,
    "utf8"
  );
}
