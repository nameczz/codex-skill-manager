import { lstat, mkdir, readdir, readlink, copyFile } from "node:fs/promises";
import path from "node:path";
import { assertInside } from "./paths.js";

export async function copySkillDirectory(sourceRoot: string, targetRoot: string): Promise<void> {
  assertInside(sourceRoot, path.dirname(sourceRoot));
  await mkdir(targetRoot, { recursive: true });
  await copyDirectory(sourceRoot, targetRoot);
}

async function copyDirectory(source: string, target: string): Promise<void> {
  const stat = await lstat(source);

  if (stat.isSymbolicLink()) {
    const linkTarget = await readlink(source);
    throw new Error(`Refusing to copy symbolic link in skill directory: ${source} -> ${linkTarget}`);
  }

  if (stat.isDirectory()) {
    await mkdir(target, { recursive: true });
    const entries = await readdir(source);
    entries.sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
      await copyDirectory(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  if (stat.isFile()) {
    await copyFile(source, target);
  }
}
