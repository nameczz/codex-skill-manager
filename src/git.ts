import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type GitCommandResult = {
  stdout: string;
  stderr: string;
};

export async function ensureGitRepository(syncRepo: string): Promise<boolean> {
  if (existsSync(path.join(syncRepo, ".git"))) {
    return false;
  }

  await execFileAsync("git", ["init"], { cwd: syncRepo });
  return true;
}

export async function gitStatus(syncRepo: string): Promise<string> {
  if (!existsSync(path.join(syncRepo, ".git"))) {
    return "not a git repository";
  }

  const { stdout } = await runGit(syncRepo, ["status", "--short"]);
  return stdout.trim();
}

export async function gitAdd(syncRepo: string, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  await runGit(syncRepo, ["add", "-A", "--", ...paths]);
}

export async function gitHasStagedChanges(syncRepo: string): Promise<boolean> {
  try {
    await runGit(syncRepo, ["diff", "--cached", "--quiet"]);
    return false;
  } catch (error) {
    if (isGitExitCode(error, 1)) {
      return true;
    }
    throw error;
  }
}

export async function gitCommit(syncRepo: string, message: string): Promise<string> {
  await runGit(syncRepo, [
    "-c",
    "user.name=Codex Skill Manager",
    "-c",
    "user.email=codex-skill-manager@local",
    "commit",
    "-m",
    message
  ]);
  const { stdout } = await runGit(syncRepo, ["rev-parse", "--short", "HEAD"]);
  return stdout.trim();
}

export async function gitPush(syncRepo: string): Promise<void> {
  const remotes = await gitRemotes(syncRepo);
  if (remotes.length === 0) {
    throw new Error("No Git remote is configured for the sync repository.");
  }

  const branch = await currentBranch(syncRepo);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];

  if (await hasUpstream(syncRepo)) {
    await runGit(syncRepo, ["push"]);
    return;
  }

  await runGit(syncRepo, ["push", "-u", remote, branch]);
}

export async function gitPull(syncRepo: string): Promise<void> {
  const status = await gitStatus(syncRepo);
  if (status.trim()) {
    throw new Error(`Cannot pull: sync repo has local uncommitted changes.\n${status}`);
  }

  const remotes = await gitRemotes(syncRepo);
  if (remotes.length === 0) {
    throw new Error("No Git remote is configured for the sync repository.");
  }

  const branch = await currentBranch(syncRepo);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];

  if (await hasUpstream(syncRepo)) {
    await runGit(syncRepo, ["pull", "--ff-only"]);
  } else {
    await runGit(syncRepo, ["pull", "--ff-only", remote, branch]);
  }
}

export async function gitHasUncommittedChanges(syncRepo: string): Promise<boolean> {
  return (await gitStatus(syncRepo)).trim().length > 0;
}

export async function gitRemotes(syncRepo: string): Promise<string[]> {
  const { stdout } = await runGit(syncRepo, ["remote"]);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function currentBranch(syncRepo: string): Promise<string> {
  const { stdout } = await runGit(syncRepo, ["branch", "--show-current"]);
  const branch = stdout.trim();
  if (!branch) {
    throw new Error("Cannot push from a detached HEAD.");
  }
  return branch;
}

export async function hasUpstream(syncRepo: string): Promise<boolean> {
  try {
    await runGit(syncRepo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    return true;
  } catch (error) {
    if (isGitExitCode(error, 128)) {
      return false;
    }
    throw error;
  }
}

export async function runGit(syncRepo: string, args: string[]): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd: syncRepo });
    return { stdout, stderr };
  } catch (error) {
    throw normalizeGitError(error);
  }
}

function isGitExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

function normalizeGitError(error: unknown): Error {
  if (error instanceof Error) {
    const stderr = (error as Error & { stderr?: unknown }).stderr;
    const stdout = (error as Error & { stdout?: unknown }).stdout;
    const details = typeof stderr === "string" && stderr.trim() ? stderr.trim() : typeof stdout === "string" ? stdout.trim() : "";
    if (details) {
      error.message = details;
    }
    return error;
  }

  return new Error(String(error));
}
