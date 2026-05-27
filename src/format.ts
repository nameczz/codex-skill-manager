import type { StatusReport } from "./types.js";

export function formatStatus(report: StatusReport): string {
  const lines: string[] = [];
  lines.push(`Sync repo: ${report.syncRepo}`);
  lines.push(`Codex skills: ${report.codexSkillsDir}`);
  lines.push(`Agents skills: ${report.agentsSkillsDir}`);
  lines.push("");
  lines.push(`Managed skills: ${report.managed.length}`);

  for (const skill of report.managed) {
    lines.push(`  - ${skill.id} [${skill.syncState}] source=${skill.localSource ?? "unknown"} installed=${skill.installed ? "yes" : "no"}`);
  }

  lines.push(`Unmanaged local skills: ${report.unmanagedLocal.length}`);
  for (const skill of report.unmanagedLocal.slice(0, 20)) {
    lines.push(`  - ${skill.id} source=${skill.source}`);
  }

  if (report.unmanagedLocal.length > 20) {
    lines.push(`  ... ${report.unmanagedLocal.length - 20} more`);
  }

  lines.push(`Repo skills not in metadata: ${report.repoOnly.length}`);
  for (const skill of report.repoOnly.slice(0, 20)) {
    lines.push(`  - ${skill.id}`);
  }

  if (report.repoOnly.length > 20) {
    lines.push(`  ... ${report.repoOnly.length - 20} more`);
  }

  lines.push(`Archived skills: ${report.archived.length}`);
  for (const skill of report.archived.slice(0, 20)) {
    lines.push(`  - ${skill.id} [${skill.archiveCopyStatus ?? "missing copy"}]`);
  }

  if (report.archived.length > 20) {
    lines.push(`  ... ${report.archived.length - 20} more`);
  }

  return lines.join("\n");
}
