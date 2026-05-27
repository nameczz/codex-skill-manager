import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { DependencyInstallResult, PackageManager } from "./types.js";

const execFileAsync = promisify(execFile);

type DependencyRunner = {
  packageManager: PackageManager;
  lockFile: string;
};

const managerPrecedence: Array<DependencyRunner> = [
  { packageManager: "pnpm", lockFile: "pnpm-lock.yaml" },
  { packageManager: "yarn", lockFile: "yarn.lock" },
  { packageManager: "bun", lockFile: "bun.lockb" },
  { packageManager: "bun", lockFile: "bun.lock" },
  { packageManager: "npm", lockFile: "package-lock.json" }
];

export async function ensureSkillDependenciesInstalled(skillPath: string): Promise<DependencyInstallResult> {
  const packageJsonPath = path.join(skillPath, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {
      status: "skipped-no-package-json",
      packageManager: null,
      command: "",
      message: "No package.json found; skipped dependency installation."
    };
  }

  const nodeModulesPath = path.join(skillPath, "node_modules");
  if (existsSync(nodeModulesPath)) {
    return {
      status: "skipped-existing-node-modules",
      packageManager: null,
      command: "",
      message: "node_modules already exists; skipped dependency installation."
    };
  }

  const packageManager = detectPackageManager(skillPath);
  const command = `${packageManager} install`;
  try {
    await execFileAsync(packageManager, ["install"], { cwd: skillPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Dependency install failed for ${path.basename(skillPath)} using ${command}: ${message}`);
  }

  return {
    status: "installed",
    packageManager,
    command,
    message: `Installed dependencies with ${command}.`
  };
}

function detectPackageManager(skillPath: string): PackageManager {
  for (const entry of managerPrecedence) {
    if (existsSync(path.join(skillPath, entry.lockFile))) {
      return entry.packageManager;
    }
  }

  return "npm";
}
