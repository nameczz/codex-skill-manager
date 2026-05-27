import { lstat, mkdir, readdir, readlink, copyFile, symlink } from "node:fs/promises";
import path from "node:path";
import { assertInside } from "./paths.js";

export async function copySkillDirectory(sourceRoot: string, targetRoot: string): Promise<void> {
  assertInside(sourceRoot, path.dirname(sourceRoot));
  await mkdir(targetRoot, { recursive: true });
  await copyDirectory(sourceRoot, targetRoot, sourceRoot);
}

async function copyDirectory(source: string, target: string, sourceRoot: string): Promise<void> {
  const stat = await lstat(source);

  if (stat.isSymbolicLink()) {
    const linkTarget = await readlink(source);
    assertSafeLinkTarget(sourceRoot, source, linkTarget);
    await symlink(linkTarget, target);
    return;
  }

  if (stat.isDirectory()) {
    await mkdir(target, { recursive: true });
    const entries = await readdir(source);
    entries.sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules") {
        continue;
      }

      await copyDirectory(path.join(source, entry), path.join(target, entry), sourceRoot);
    }
    return;
  }

  if (stat.isFile()) {
    await copyFile(source, target);
  }
}

function assertSafeLinkTarget(sourceRoot: string, source: string, linkTarget: string): void {
  const resolvedTarget = path.resolve(path.dirname(source), linkTarget);
  try {
    assertInside(resolvedTarget, sourceRoot);
  } catch {
    throw new Error(`Refusing to copy symbolic link that escapes skill directory: ${source} -> ${linkTarget}`);
  }
}
