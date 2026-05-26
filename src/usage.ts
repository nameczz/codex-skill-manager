import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { LocalConfig, UsageEvent } from "./types.js";
import { repoUsageEventsPath } from "./paths.js";
import { validateSkillId } from "./paths.js";

export async function recordUsageEvent(config: LocalConfig, skillId: string, options: { invokedAt?: string } = {}): Promise<UsageEvent> {
  const validatedSkillId = validateSkillId(skillId);
  const invokedAt = options.invokedAt ?? new Date().toISOString();
  validateInvokedAt(invokedAt);

  const event: UsageEvent = {
    skillId: validatedSkillId,
    invokedAt,
    source: "record"
  };

  await mkdir(path.dirname(repoUsageEventsPath(config.syncRepo)), { recursive: true });
  await appendFile(repoUsageEventsPath(config.syncRepo), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readUsageEvents(syncRepo: string): Promise<UsageEvent[]> {
  const filePath = repoUsageEventsPath(syncRepo);
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as UsageEvent;
      } catch {
        return null;
      }
    })
    .map((event) => toUsageEvent(event))
    .filter((event): event is UsageEvent => event !== null)
    .map((event) => event);
}

export async function getLastUsageBySkill(syncRepo: string, skillIds: string[]): Promise<Map<string, string | null>> {
  const now = new Map(skillIds.map((skillId) => [skillId, null] as [string, string | null]));
  const events = await readUsageEvents(syncRepo);
  const lookup = new Set(skillIds);

  for (const event of events) {
    if (!lookup.has(event.skillId)) {
      continue;
    }

    const current = now.get(event.skillId) ?? null;
    if (current === null || new Date(event.invokedAt).getTime() > new Date(current).getTime()) {
      now.set(event.skillId, event.invokedAt);
    }
  }

  return now;
}

function validateInvokedAt(invokedAt: string): void {
  if (typeof invokedAt !== "string" || Number.isNaN(new Date(invokedAt).getTime())) {
    throw new Error("invokedAt must be an ISO timestamp.");
  }
}

function toUsageEvent(candidate: unknown): UsageEvent | null {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    (candidate as { source?: string }).source !== "record" ||
    typeof (candidate as { skillId?: unknown }).skillId !== "string" ||
    typeof (candidate as { invokedAt?: unknown }).invokedAt !== "string" ||
    !isFiniteDate((candidate as { invokedAt: string }).invokedAt)
  ) {
    return null;
  }

  try {
    return {
      ...candidate,
      skillId: validateSkillId((candidate as { skillId: string }).skillId),
      invokedAt: (candidate as { invokedAt: string }).invokedAt,
      source: "record"
    } as UsageEvent;
  } catch {
    return null;
  }
}

function isFiniteDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}
