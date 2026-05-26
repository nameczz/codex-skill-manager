import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LocalConfig, UsageHookStatus } from "./types.js";
import { loadLocalConfig } from "./config.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { expandHome, getDefaultConfigDir, validateSkillId, type PathOptions } from "./paths.js";
import { recordUsageEvent } from "./usage.js";

const HOOK_STATUS_MESSAGE = "Record Codex Skill Manager usage";
const HOOK_TIMEOUT_SECONDS = 5;

type CodexHooksFile = {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
};

type HookGroup = {
  matcher?: string;
  hooks?: HookCommand[];
  [key: string]: unknown;
};

type HookCommand = {
  type?: string;
  command?: string;
  command_windows?: string;
  timeout?: number;
  statusMessage?: string;
  [key: string]: unknown;
};

export type CodexHookOptions = PathOptions & {
  command?: string;
};

export type HookRecordResult = {
  skillIds: string[];
  recorded: number;
};

export function codexHooksPath(options: PathOptions = {}): string {
  const env = options.env ?? process.env;
  const home = options.homeDir ?? homedir();
  const codexHome = path.resolve(expandHome(env.CSM_CODEX_HOME ?? env.CODEX_HOME ?? "~/.codex", home));
  return path.join(codexHome, "hooks.json");
}

export async function getUsageHookStatus(config: LocalConfig, options: CodexHookOptions = {}): Promise<UsageHookStatus> {
  const hooksPath = codexHooksPath(options);
  const commandResult = tryBuildUsageHookCommand(options);
  const existingResult = await tryFindInstalledUsageHook(hooksPath);
  return {
    hooksPath,
    installed: Boolean(existingResult.hook),
    needsUpdate: Boolean(existingResult.hook && commandResult.command && existingResult.hook.command !== commandResult.command),
    installable: Boolean(commandResult.command),
    reason: existingResult.reason ?? commandResult.reason,
    command: commandResult.command ?? "",
    installedCommand: existingResult.hook?.command ?? null
  };
}

export async function installUsageHook(config: LocalConfig, options: CodexHookOptions = {}): Promise<UsageHookStatus> {
  const hooksPath = codexHooksPath(options);
  const command = buildUsageHookCommand(options);
  const hooksFile = await readHooksFile(hooksPath);
  const hooks = normalizeHooksMap(hooksFile);
  const userPromptGroups = removeExistingUsageHooks(hooks.UserPromptSubmit ?? []);

  userPromptGroups.push({
    hooks: [
      {
        type: "command",
        command,
        timeout: HOOK_TIMEOUT_SECONDS,
        statusMessage: HOOK_STATUS_MESSAGE
      }
    ]
  });

  hooks.UserPromptSubmit = userPromptGroups;
  hooksFile.hooks = hooks;
  await writeJsonFile(hooksPath, hooksFile);
  return getUsageHookStatus(config, options);
}

export async function removeUsageHook(config: LocalConfig, options: CodexHookOptions = {}): Promise<UsageHookStatus> {
  const hooksPath = codexHooksPath(options);
  if (!existsSync(hooksPath)) {
    return getUsageHookStatus(config, options);
  }

  const hooksFile = await readHooksFile(hooksPath);
  const hooks = normalizeHooksMap(hooksFile);
  hooks.UserPromptSubmit = removeExistingUsageHooks(hooks.UserPromptSubmit ?? []);

  if (hooks.UserPromptSubmit.length === 0) {
    delete hooks.UserPromptSubmit;
  }

  hooksFile.hooks = hooks;
  await writeJsonFile(hooksPath, hooksFile);
  return getUsageHookStatus(config, options);
}

export async function recordSkillMentionsFromHookInput(input: unknown, options: PathOptions = {}): Promise<HookRecordResult> {
  const prompt = extractPrompt(input);
  if (!prompt) {
    return { skillIds: [], recorded: 0 };
  }

  let config: LocalConfig;
  try {
    config = await loadLocalConfig(options);
  } catch {
    return { skillIds: [], recorded: 0 };
  }

  const skillIds = extractSkillIdsFromText(prompt, config);
  for (const skillId of skillIds) {
    await recordUsageEvent(config, skillId);
  }

  return {
    skillIds,
    recorded: skillIds.length
  };
}

export function extractSkillIdsFromText(text: string, config: LocalConfig): string[] {
  const candidates = new Set<string>();
  const roots = [config.codexSkillsDir, config.agentsSkillsDir].map((root) => path.resolve(root));

  for (const rawPath of extractSkillFilePaths(text)) {
    const decodedPath = decodeSkillPath(rawPath);
    if (!decodedPath) {
      continue;
    }

    const absolutePath = path.isAbsolute(decodedPath) ? path.resolve(decodedPath) : decodedPath;
    for (const root of roots) {
      if (!path.isAbsolute(absolutePath)) {
        continue;
      }

      const skillDir = path.dirname(absolutePath);
      const relative = path.relative(root, skillDir);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        continue;
      }

      addValidSkillId(candidates, relative.split(path.sep).join("/"));
    }
  }

  for (const skillId of extractRelativeSkillIds(text, [".codex/skills/", ".agents/skills/"])) {
    addValidSkillId(candidates, skillId);
  }

  return [...candidates].sort((a, b) => a.localeCompare(b));
}

function buildUsageHookCommand(options: CodexHookOptions): string {
  if (options.command) {
    return options.command;
  }

  const env = options.env ?? process.env;
  if (env.CSM_HOOK_COMMAND) {
    return env.CSM_HOOK_COMMAND;
  }

  const cliPath = resolveCompiledCliPath();
  const configDir = getDefaultConfigDir(options);
  return ["/usr/bin/env", `CSM_CONFIG_DIR=${shellQuote(configDir)}`, shellQuote(process.execPath), shellQuote(cliPath), "record-hook"].join(" ");
}

function tryBuildUsageHookCommand(options: CodexHookOptions): { command: string | null; reason: string | null } {
  try {
    return { command: buildUsageHookCommand(options), reason: null };
  } catch (error) {
    return {
      command: null,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function resolveCompiledCliPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist/src/cli.js"),
    fileURLToPath(new URL("./cli.js", import.meta.url))
  ];

  const existing = candidates.find((candidate) => existsSync(candidate));
  if (existing) {
    return existing;
  }

  throw new Error("Build the CLI before installing the Codex hook. Run npm run build, then install the hook again.");
}

async function findInstalledUsageHook(hooksPath: string): Promise<HookCommand | null> {
  const hooksFile = await readHooksFile(hooksPath);
  const hooks = normalizeHooksMap(hooksFile);
  for (const group of hooks.UserPromptSubmit ?? []) {
    for (const hook of group.hooks ?? []) {
      if (isUsageHook(hook)) {
        return hook;
      }
    }
  }

  return null;
}

async function tryFindInstalledUsageHook(hooksPath: string): Promise<{ hook: HookCommand | null; reason: string | null }> {
  try {
    return { hook: await findInstalledUsageHook(hooksPath), reason: null };
  } catch (error) {
    return {
      hook: null,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readHooksFile(hooksPath: string): Promise<CodexHooksFile> {
  if (!existsSync(hooksPath)) {
    return { hooks: {} };
  }

  const raw = await readFile(hooksPath, "utf8");
  if (!raw.trim()) {
    return { hooks: {} };
  }

  const parsed = await readJsonFile<unknown>(hooksPath);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${hooksPath} must contain a JSON object.`);
  }

  return parsed as CodexHooksFile;
}

function normalizeHooksMap(file: CodexHooksFile): Record<string, HookGroup[]> {
  if (file.hooks === undefined) {
    return {};
  }

  if (!file.hooks || typeof file.hooks !== "object" || Array.isArray(file.hooks)) {
    throw new Error("hooks.json field \"hooks\" must be an object.");
  }

  const normalized: Record<string, HookGroup[]> = {};
  for (const [eventName, groups] of Object.entries(file.hooks)) {
    if (!Array.isArray(groups)) {
      throw new Error(`hooks.${eventName} must be an array.`);
    }

    normalized[eventName] = groups.map((group) => normalizeHookGroup(eventName, group));
  }

  return normalized;
}

function normalizeHookGroup(eventName: string, group: unknown): HookGroup {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    throw new Error(`hooks.${eventName} entries must be objects.`);
  }

  const hooks = (group as HookGroup).hooks;
  if (hooks !== undefined && !Array.isArray(hooks)) {
    throw new Error(`hooks.${eventName}.hooks must be an array.`);
  }

  return {
    ...(group as HookGroup),
    hooks: hooks?.map((hook) => {
      if (!hook || typeof hook !== "object" || Array.isArray(hook)) {
        throw new Error(`hooks.${eventName}.hooks entries must be objects.`);
      }

      return hook as HookCommand;
    })
  };
}

function removeExistingUsageHooks(groups: HookGroup[]): HookGroup[] {
  return groups
    .map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).filter((hook) => !isUsageHook(hook))
    }))
    .filter((group) => (group.hooks ?? []).length > 0);
}

function isUsageHook(hook: HookCommand): boolean {
  return (
    hook.type === "command" &&
    (hook.statusMessage === HOOK_STATUS_MESSAGE ||
      (typeof hook.command === "string" && hook.command.includes("record-hook") && hook.command.includes("CSM_CONFIG_DIR")))
  );
}

function extractPrompt(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const eventName = (input as { hook_event_name?: unknown }).hook_event_name;
  if (eventName !== undefined && eventName !== "UserPromptSubmit") {
    return null;
  }

  const prompt = (input as { prompt?: unknown }).prompt;
  return typeof prompt === "string" && prompt.trim().length > 0 ? prompt : null;
}

function extractSkillFilePaths(text: string): string[] {
  const paths: string[] = [];
  const markdownLinkPattern = /\]\(([^)\s]+?\/SKILL\.md)(?:#[^)]+)?\)/g;
  const plainPathPattern = /((?:file:\/\/)?(?:~|\/|[A-Za-z]:[\\/])[^\s'"()<>]*?\/SKILL\.md)/g;

  for (const match of text.matchAll(markdownLinkPattern)) {
    if (match[1]) {
      paths.push(match[1]);
    }
  }

  for (const match of text.matchAll(plainPathPattern)) {
    if (match[1]) {
      paths.push(match[1]);
    }
  }

  return paths;
}

function extractRelativeSkillIds(text: string, rootMarkers: string[]): string[] {
  const skillIds: string[] = [];
  for (const marker of rootMarkers) {
    let index = text.indexOf(marker);
    while (index !== -1) {
      const start = index + marker.length;
      const endMarker = "/SKILL.md";
      const end = text.indexOf(endMarker, start);
      if (end !== -1) {
        skillIds.push(text.slice(start, end));
      }

      index = text.indexOf(marker, start);
    }
  }

  return skillIds;
}

function decodeSkillPath(rawPath: string): string | null {
  const withoutFileProtocol = rawPath.startsWith("file://") ? rawPath.slice("file://".length) : rawPath;
  try {
    return decodeURIComponent(withoutFileProtocol);
  } catch {
    return withoutFileProtocol;
  }
}

function addValidSkillId(candidates: Set<string>, skillId: string): void {
  try {
    candidates.add(validateSkillId(skillId));
  } catch {
    // Ignore non-user skill roots and malformed paths.
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
