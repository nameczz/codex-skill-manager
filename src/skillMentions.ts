import { existsSync } from "node:fs";
import path from "node:path";
import type { LocalConfig } from "./types.js";
import { validateSkillId } from "./paths.js";

export function extractSkillIdsFromText(text: string, config: LocalConfig): string[] {
  const candidates = new Set<string>();
  const roots = [config.codexSkillsDir, config.agentsSkillsDir].map((root) => path.resolve(root));

  for (const skillId of extractSkillFilePathIdsFromText(text, config)) {
    addValidSkillId(candidates, skillId);
  }

  for (const skillId of extractRelativeSkillIds(text, [".codex/skills/", ".agents/skills/"])) {
    addValidSkillId(candidates, skillId);
  }

  for (const skillId of extractDollarSkillIds(text, roots)) {
    addValidSkillId(candidates, skillId);
  }

  return [...candidates].sort((a, b) => a.localeCompare(b));
}

export function extractSkillFilePathIdsFromText(text: string, config: LocalConfig): string[] {
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

  return [...candidates].sort((a, b) => a.localeCompare(b));
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

function extractDollarSkillIds(text: string, roots: string[]): string[] {
  const skillIds = new Set<string>();
  const pattern = /(^|[^\w/.-])\$([A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*)\b/g;

  for (const match of text.matchAll(pattern)) {
    const candidate = match[2];
    if (!candidate) {
      continue;
    }

    let skillId: string;
    try {
      skillId = validateSkillId(candidate);
    } catch {
      continue;
    }

    if (roots.some((root) => existsSync(path.join(root, ...skillId.split("/"), "SKILL.md")))) {
      skillIds.add(skillId);
    }
  }

  return [...skillIds];
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
