import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { LocalConfig, LocalSkillSource } from "./types.js";
import { tryLoadLocalConfig } from "./config.js";
import { initialize } from "./init.js";
import { buildStatusReport } from "./status.js";
import { selectDirectory, type DirectoryPicker } from "./directoryPicker.js";
import { gitStatus } from "./git.js";
import { importLocalSkill } from "./importSkill.js";
import { installRepoSkill } from "./installSkill.js";
import { syncSelectedSkills, type SyncSelection } from "./sync.js";
import { getDefaultAgentsSkillsDir, getDefaultCacheDir, getDefaultCodexSkillsDir, resolveSkillPath } from "./paths.js";

export type ServerOptions = {
  host?: string;
  port?: number;
  directoryPicker?: DirectoryPicker;
};

type SkillActionBody = {
  skillId?: string;
  source?: string;
  force?: boolean;
};

type SkillFileBody = SkillActionBody & {
  content?: unknown;
};

type InitBody = {
  syncRepo?: string;
  codexSkillsDir?: string;
  agentsSkillsDir?: string;
  cacheDir?: string;
};

type SelectDirectoryBody = {
  title?: string;
};

type SyncBody = {
  skills?: Array<{
    skillId?: string;
    source?: string;
  }>;
};

export async function startServer(options: ServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  let config: LocalConfig | null = await tryLoadLocalConfig();
  const directoryPicker = options.directoryPicker ?? selectDirectory;
  const app = fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    const normalized = normalizeError(error);
    reply.code(normalized.statusCode).send({
      error: normalized.message
    });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/status", async () => {
    if (!config) {
      return {
        configured: false,
        defaults: {
          syncRepo: "",
          codexSkillsDir: getDefaultCodexSkillsDir(),
          agentsSkillsDir: getDefaultAgentsSkillsDir(),
          cacheDir: getDefaultCacheDir()
        }
      };
    }

    const report = await buildStatusReport(config);
    return {
      configured: true,
      config,
      gitStatus: await gitStatus(config.syncRepo),
      report
    };
  });

  app.post<{ Body: InitBody }>("/api/init", async (request, reply) => {
    const syncRepo = optionalPath(request.body?.syncRepo);
    if (!syncRepo) {
      reply.code(400);
      return { error: "Choose a sync repository before initializing." };
    }

    const result = await initialize({
      syncRepo,
      codexSkillsDir: optionalPath(request.body?.codexSkillsDir),
      agentsSkillsDir: optionalPath(request.body?.agentsSkillsDir),
      cacheDir: optionalPath(request.body?.cacheDir)
    });
    config = result.config;
    return {
      configured: true,
      gitInitialized: result.gitInitialized,
      config: result.config
    };
  });

  app.put<{ Body: InitBody }>("/api/config", async (request) => {
    const loaded = requireConfig(config);
    const result = await initialize({
      syncRepo: optionalPath(request.body?.syncRepo) ?? loaded.syncRepo,
      codexSkillsDir: optionalPath(request.body?.codexSkillsDir) ?? loaded.codexSkillsDir,
      agentsSkillsDir: optionalPath(request.body?.agentsSkillsDir) ?? loaded.agentsSkillsDir,
      cacheDir: optionalPath(request.body?.cacheDir) ?? loaded.cacheDir,
      force: true
    });
    config = result.config;
    return {
      configured: true,
      gitInitialized: result.gitInitialized,
      config: result.config,
      gitStatus: await gitStatus(result.config.syncRepo),
      report: await buildStatusReport(result.config)
    };
  });

  app.post<{ Body: SelectDirectoryBody }>("/api/select-directory", async (request) => {
    return directoryPicker(optionalTitle(request.body?.title));
  });

  app.post<{ Body: SkillActionBody }>("/api/import", async (request, reply) => {
    const loaded = requireConfig(config);
    const skillId = requireSkillId(request.body);
    const record = await importLocalSkill(loaded, skillId, { force: request.body.force, source: optionalLocalSource(request.body.source) });
    reply.code(201);
    return { record };
  });

  app.post<{ Body: SkillActionBody }>("/api/install", async (request) => {
    const loaded = requireConfig(config);
    const skillId = requireSkillId(request.body);
    const record = await installRepoSkill(loaded, skillId, { force: request.body.force });
    return { record };
  });

  app.post<{ Body: SkillActionBody }>("/api/skill-file", async (request) => {
    const loaded = requireConfig(config);
    const filePath = localSkillMdPath(loaded, request.body);
    if (!existsSync(filePath)) {
      throw httpError(404, "Local SKILL.md not found.");
    }

    return {
      path: filePath,
      content: await readFile(filePath, "utf8")
    };
  });

  app.put<{ Body: SkillFileBody }>("/api/skill-file", async (request) => {
    const loaded = requireConfig(config);
    const filePath = localSkillMdPath(loaded, request.body);
    if (!existsSync(filePath)) {
      throw httpError(404, "Local SKILL.md not found.");
    }

    await writeFile(filePath, requireSkillFileContent(request.body), "utf8");
    return { path: filePath };
  });

  app.post<{ Body: SyncBody }>("/api/sync", async (request) => {
    const loaded = requireConfig(config);
    const result = await syncSelectedSkills(loaded, requireSyncSelections(request.body));
    return { result };
  });

  const webRoot = findWebRoot();
  if (webRoot) {
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: "/"
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      reply.sendFile("index.html");
    });
  } else {
    app.get("/", async (_request, reply) => {
      reply.type("text/html").send(
        "<main style=\"font-family: sans-serif; padding: 32px\"><h1>Codex Skill Manager</h1><p>Web assets are not built yet. Run <code>npm run build</code> first.</p></main>"
      );
    });
  }

  const address = await app.listen({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3017
  });

  return {
    url: address,
    close: () => app.close()
  };
}

function requireConfig(config: LocalConfig | null): LocalConfig {
  if (!config) {
    throw httpError(409, "Codex Skill Manager is not initialized.");
  }

  return config;
}

function requireSkillId(body: SkillActionBody | undefined): string {
  if (!body?.skillId || typeof body.skillId !== "string") {
    throw httpError(400, "Request body must include skillId.");
  }

  return body.skillId;
}

function requireSkillFileContent(body: SkillFileBody | undefined): string {
  if (!body || typeof body.content !== "string") {
    throw httpError(400, "Request body must include content.");
  }

  return body.content;
}

function requireSyncSelections(body: SyncBody | undefined): SyncSelection[] {
  if (!body || !Array.isArray(body.skills)) {
    throw httpError(400, "Request body must include skills.");
  }

  return body.skills.map((skill) => ({
    skillId: requireSkillId(skill),
    source: optionalLocalSource(skill.source)
  }));
}

function optionalPath(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw httpError(400, "Path values must be strings.");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalTitle(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw httpError(400, "Directory picker title must be a string.");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalLocalSource(value: unknown): LocalSkillSource | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "codex" || value === "agents") {
    return value;
  }

  throw httpError(400, "Skill source must be codex or agents.");
}

function requireLocalSource(value: unknown): LocalSkillSource {
  const source = optionalLocalSource(value);
  if (!source) {
    throw httpError(400, "Request body must include source.");
  }

  return source;
}

function localSkillMdPath(config: LocalConfig, body: SkillActionBody | undefined): string {
  const skillId = requireSkillId(body);
  const source = requireLocalSource(body?.source);
  const localRoot = source === "agents" ? config.agentsSkillsDir : config.codexSkillsDir;

  try {
    return path.join(resolveSkillPath(localRoot, skillId), "SKILL.md");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid skillId.";
    throw httpError(400, message);
  }
}

function findWebRoot(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "dist/web"),
    fileURLToPath(new URL("../web", import.meta.url)),
    fileURLToPath(new URL("../../dist/web", import.meta.url))
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? null;
}

function httpError(statusCode: number, message: string): Error & { apiMessage: string; statusCode: number } {
  const error = new Error(message) as Error & { apiMessage: string; statusCode: number };
  error.apiMessage = message;
  error.statusCode = statusCode;
  return error;
}

function normalizeError(error: unknown): { statusCode: number; message: string } {
  if (error instanceof Error) {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    const apiMessage = (error as Error & { apiMessage?: string }).apiMessage;
    return {
      statusCode: statusCode && statusCode >= 400 ? statusCode : 500,
      message: apiMessage ?? error.message
    };
  }

  return {
    statusCode: 500,
    message: String(error)
  };
}
