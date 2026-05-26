import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "../src/server.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("server", () => {
  it("starts without config and reports defaults", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");
    process.env.CSM_SYNC_REPO = path.join(root, "repo");
    process.env.CSM_CODEX_SKILLS_DIR = path.join(root, "skills");
    process.env.CSM_AGENTS_SKILLS_DIR = path.join(root, "agents-skills");
    process.env.CSM_CACHE_DIR = path.join(root, "cache");

    const server = await startServer({ port: 0 });
    try {
      const response = await fetch(`${server.url}/api/status`);
      const payload = (await response.json()) as {
        configured: boolean;
        defaults: { syncRepo: string; agentsSkillsDir: string; cacheDir: string };
      };
      expect(payload.configured).toBe(false);
      expect(payload.defaults.syncRepo).toBe("");
      expect(payload.defaults.agentsSkillsDir).toBe(path.join(root, "agents-skills"));
      expect(payload.defaults.cacheDir).toBe(path.join(root, "cache"));
    } finally {
      await server.close();
    }
  });

  it("requires the Web UI to provide a sync repository during initialization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-init-required-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");

    const server = await startServer({ port: 0 });
    try {
      const response = await fetch(`${server.url}/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(payload.error).toBe("Choose a sync repository before initializing.");
    } finally {
      await server.close();
    }
  });

  it("initializes with paths supplied by the Web UI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-init-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");

    const server = await startServer({ port: 0 });
    try {
      const body = {
        syncRepo: path.join(root, "chosen-repo"),
        codexSkillsDir: path.join(root, "chosen-skills"),
        agentsSkillsDir: path.join(root, "chosen-agents-skills"),
        cacheDir: path.join(root, "chosen-cache")
      };
      const response = await fetch(`${server.url}/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as { configured: boolean; config: typeof body };

      expect(response.ok).toBe(true);
      expect(payload.configured).toBe(true);
      expect(payload.config.syncRepo).toBe(body.syncRepo);
      expect(payload.config.codexSkillsDir).toBe(body.codexSkillsDir);
      expect(payload.config.agentsSkillsDir).toBe(body.agentsSkillsDir);
      expect(payload.config.cacheDir).toBe(body.cacheDir);
    } finally {
      await server.close();
    }
  });

  it("updates configured paths after initialization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-config-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");

    const server = await startServer({ port: 0 });
    try {
      const initialBody = {
        syncRepo: path.join(root, "repo-a"),
        codexSkillsDir: path.join(root, "skills-a"),
        agentsSkillsDir: path.join(root, "agents-a"),
        cacheDir: path.join(root, "cache-a")
      };
      const updatedBody = {
        syncRepo: path.join(root, "repo-b"),
        codexSkillsDir: path.join(root, "skills-b"),
        agentsSkillsDir: path.join(root, "agents-b"),
        cacheDir: path.join(root, "cache-b")
      };

      await fetch(`${server.url}/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialBody)
      });

      const response = await fetch(`${server.url}/api/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedBody)
      });
      const payload = (await response.json()) as { configured: boolean; config: typeof updatedBody };

      expect(response.ok).toBe(true);
      expect(payload.configured).toBe(true);
      expect(payload.config.syncRepo).toBe(updatedBody.syncRepo);
      expect(payload.config.codexSkillsDir).toBe(updatedBody.codexSkillsDir);
      expect(payload.config.agentsSkillsDir).toBe(updatedBody.agentsSkillsDir);
      expect(payload.config.cacheDir).toBe(updatedBody.cacheDir);
    } finally {
      await server.close();
    }
  });

  it("reads and writes local SKILL.md files by source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-skill-file-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");

    const server = await startServer({ port: 0 });
    try {
      const config = {
        syncRepo: path.join(root, "repo"),
        codexSkillsDir: path.join(root, "codex-skills"),
        agentsSkillsDir: path.join(root, "agents-skills"),
        cacheDir: path.join(root, "cache")
      };
      await fetch(`${server.url}/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });

      const skillDir = path.join(config.agentsSkillsDir, "klay-writer");
      const skillFile = path.join(skillDir, "SKILL.md");
      const original = "---\nname: Klay Writer\n---\nOriginal body\n";
      await mkdir(skillDir, { recursive: true });
      await writeFile(skillFile, original, "utf8");

      const readResponse = await fetch(`${server.url}/api/skill-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: "klay-writer", source: "agents" })
      });
      const readPayload = (await readResponse.json()) as { path: string; content: string };

      expect(readResponse.ok).toBe(true);
      expect(readPayload.path).toBe(skillFile);
      expect(readPayload.content).toBe(original);

      const updated = "---\nname: Klay Writer\n---\nUpdated body\n";
      const writeResponse = await fetch(`${server.url}/api/skill-file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: "klay-writer", source: "agents", content: updated })
      });

      expect(writeResponse.ok).toBe(true);
      expect(await readFile(skillFile, "utf8")).toBe(updated);
    } finally {
      await server.close();
    }
  });

  it("requires a local source before reading SKILL.md", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-skill-file-source-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");

    const server = await startServer({ port: 0 });
    try {
      await fetch(`${server.url}/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncRepo: path.join(root, "repo"),
          codexSkillsDir: path.join(root, "codex-skills"),
          agentsSkillsDir: path.join(root, "agents-skills"),
          cacheDir: path.join(root, "cache")
        })
      });

      const response = await fetch(`${server.url}/api/skill-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: "klay-writer" })
      });
      const payload = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(payload.error).toBe("Request body must include source.");
    } finally {
      await server.close();
    }
  });

  it("selects directories through an injected picker", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-picker-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");
    const selectedPath = path.join(root, "selected");
    let receivedTitle: string | undefined;

    const server = await startServer({
      port: 0,
      directoryPicker: async (title) => {
        receivedTitle = title;
        return { canceled: false, path: selectedPath };
      }
    });
    try {
      const response = await fetch(`${server.url}/api/select-directory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Choose sync repo" })
      });
      const payload = (await response.json()) as { canceled: boolean; path: string };

      expect(response.ok).toBe(true);
      expect(receivedTitle).toBe("Choose sync repo");
      expect(payload).toEqual({ canceled: false, path: selectedPath });
    } finally {
      await server.close();
    }
  });

  it("does not treat canceled directory selection as an error", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-server-picker-cancel-"));
    process.env.CSM_CONFIG_DIR = path.join(root, "config");

    const server = await startServer({
      port: 0,
      directoryPicker: async () => ({ canceled: true })
    });
    try {
      const response = await fetch(`${server.url}/api/select-directory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { canceled: boolean };

      expect(response.ok).toBe(true);
      expect(payload).toEqual({ canceled: true });
    } finally {
      await server.close();
    }
  });
});
