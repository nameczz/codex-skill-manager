import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";

export async function hashDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  await addPathToHash(root, root, hash);
  return hash.digest("hex");
}

async function addPathToHash(root: string, current: string, hash: ReturnType<typeof createHash>): Promise<void> {
  const stat = await lstat(current);
  const relative = path.relative(root, current).split(path.sep).join("/") || ".";

  if (stat.isSymbolicLink()) {
    const target = await readlink(current);
    hash.update(`link:${relative}:${target}\n`);
    return;
  }

  if (stat.isDirectory()) {
    hash.update(`dir:${relative}\n`);
    const entries = await readdir(current);
    entries.sort((a, b) => a.localeCompare(b));

    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules") {
        continue;
      }
      await addPathToHash(root, path.join(current, entry), hash);
    }
    return;
  }

  if (stat.isFile()) {
    hash.update(`file:${relative}:${stat.size}\n`);
    hash.update(await readFile(current));
  }
}
