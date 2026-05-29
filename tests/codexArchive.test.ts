import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  listCodexArchiveSessions,
  moveCodexArchiveSessionToTrash,
  previewCodexArchiveSession,
  restoreCodexArchiveSession
} from "../src/codexArchive.js";

describe("codex archive", () => {
  it("lists archived sessions with session index titles and limited preview", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-codex-archive-"));
    const { fileName, options } = await writeArchivedSession(root);

    const list = await listCodexArchiveSessions("active", options);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.fileName).toBe(fileName);
    expect(list.items[0]?.title).toBe("Archived product thread");
    expect(list.items[0]?.sessionId).toBe("019e24bb-2ac1-7ab3-b603-b5b3a2edcee8");
    expect(list.items[0]?.cwd).toBe("/tmp/project");
    expect(list.items[0]?.source).toBe("Codex Desktop");

    const preview = await previewCodexArchiveSession("active", fileName, options);
    expect(preview.preview.join("\n")).toContain("session_meta");
    expect(preview.preview.join("\n")).toContain("Hello from archive");
    expect(preview.truncated).toBe(false);
  });

  it("soft deletes archived sessions to trash and restores them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-codex-archive-trash-"));
    const { archiveRoot, fileName, options } = await writeArchivedSession(root);

    await moveCodexArchiveSessionToTrash(fileName, options);
    expect(existsSync(path.join(archiveRoot, fileName))).toBe(false);
    expect(existsSync(path.join(archiveRoot, ".trash", fileName))).toBe(true);
    expect((await listCodexArchiveSessions("active", options)).items).toHaveLength(0);
    expect((await listCodexArchiveSessions("trash", options)).items).toHaveLength(1);

    await restoreCodexArchiveSession(fileName, options);
    expect(existsSync(path.join(archiveRoot, fileName))).toBe(true);
    expect(existsSync(path.join(archiveRoot, ".trash", fileName))).toBe(false);
  });

  it("rejects path traversal and non-jsonl file names", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csm-codex-archive-safe-"));
    const { options } = await writeArchivedSession(root);

    await expect(previewCodexArchiveSession("active", "../escape.jsonl", options)).rejects.toThrow("safe basename");
    await expect(previewCodexArchiveSession("active", "/tmp/escape.jsonl", options)).rejects.toThrow("safe basename");
    await expect(previewCodexArchiveSession("active", "escape.txt", options)).rejects.toThrow(".jsonl");
  });
});

async function writeArchivedSession(root: string) {
  const codexHome = path.join(root, "codex-home");
  const archiveRoot = path.join(codexHome, "archived_sessions");
  await mkdir(archiveRoot, { recursive: true });

  const sessionId = "019e24bb-2ac1-7ab3-b603-b5b3a2edcee8";
  const fileName = `rollout-2026-05-14T12-25-06-${sessionId}.jsonl`;
  await writeFile(
    path.join(archiveRoot, fileName),
    [
      JSON.stringify({
        timestamp: "2026-05-14T04:25:42.646Z",
        type: "session_meta",
        payload: {
          id: sessionId,
          cwd: "/tmp/project",
          originator: "Codex Desktop",
          source: "vscode"
        }
      }),
      JSON.stringify({
        timestamp: "2026-05-14T04:26:00.000Z",
        type: "event_msg",
        payload: {
          type: "message",
          content: [{ type: "text", text: "Hello from archive" }]
        }
      })
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(codexHome, "session_index.jsonl"),
    `${JSON.stringify({ id: sessionId, thread_name: "Archived product thread", updated_at: "2026-05-14T04:27:00.000Z" })}\n`,
    "utf8"
  );

  expect(await readFile(path.join(archiveRoot, fileName), "utf8")).toContain(sessionId);
  return {
    archiveRoot,
    fileName,
    options: { env: { CODEX_HOME: codexHome } as NodeJS.ProcessEnv }
  };
}
