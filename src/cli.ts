#!/usr/bin/env node
import { Command } from "commander";
import { createLocalConfig, loadLocalConfig } from "./config.js";
import { initialize } from "./init.js";
import { buildStatusReport } from "./status.js";
import { formatStatus } from "./format.js";
import { importLocalSkill } from "./importSkill.js";
import { installRepoSkill } from "./installSkill.js";
import { gitStatus } from "./git.js";
import { startServer } from "./server.js";
import { syncSelectedSkills } from "./sync.js";

const program = new Command();

program
  .name("skill-manager")
  .description("Manage Codex skills with a Git-backed local sync repository.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize local config and the Git-backed skill sync repository.")
  .option("--sync-repo <path>", "Path to the sync repository")
  .option("--skills-dir <path>", "Path to the Codex skills directory")
  .option("--agents-skills-dir <path>", "Path to the Agents skills directory")
  .option("--cache-dir <path>", "Path to local cache/config directory")
  .option("--force", "Overwrite local config")
  .action(async (options) => {
    const result = await initialize({
      syncRepo: options.syncRepo,
      codexSkillsDir: options.skillsDir,
      agentsSkillsDir: options.agentsSkillsDir,
      cacheDir: options.cacheDir,
      force: options.force
    });

    console.log(`Initialized Codex Skill Manager`);
    console.log(`Sync repo: ${result.config.syncRepo}`);
    console.log(`Codex skills: ${result.config.codexSkillsDir}`);
    console.log(`Agents skills: ${result.config.agentsSkillsDir}`);
    console.log(`Git repository: ${result.gitInitialized ? "created" : "already present"}`);
  });

program
  .command("status")
  .description("Show managed and unmanaged skill status.")
  .option("--json", "Print JSON")
  .action(async (options) => {
    const config = await loadLocalConfig();
    const report = await buildStatusReport(config);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(formatStatus(report));
    const status = await gitStatus(config.syncRepo);
    console.log("");
    console.log(`Git status: ${status || "clean"}`);
  });

program
  .command("import")
  .argument("<skill-id>")
  .description("Import a local Codex skill into the sync repository.")
  .option("--force", "Overwrite an existing repo copy")
  .action(async (skillId, options) => {
    const config = await loadLocalConfig();
    const record = await importLocalSkill(config, skillId, { force: options.force });
    console.log(`Imported ${record.id}`);
  });

program
  .command("sync")
  .argument("<skill-id...>")
  .description("Commit and push selected skills to the sync repository.")
  .action(async (skillIds: string[]) => {
    const config = await loadLocalConfig();
    const result = await syncSelectedSkills(
      config,
      skillIds.map((skillId) => ({ skillId }))
    );
    console.log(result.committed ? `Committed ${result.commitHash}` : "No new commit was needed.");
    console.log(`Pushed ${result.skillIds.length} skill${result.skillIds.length === 1 ? "" : "s"}: ${result.skillIds.join(", ")}`);
  });

program
  .command("serve")
  .description("Start the local Web UI.")
  .option("--host <host>", "Host to bind", "127.0.0.1")
  .option("--port <port>", "Port to bind", "3017")
  .action(async (options) => {
    const port = Number.parseInt(options.port, 10);
    if (!Number.isFinite(port)) {
      throw new Error(`Invalid port: ${options.port}`);
    }

    const server = await startServer({ host: options.host, port });
    console.log(`Codex Skill Manager is running at ${server.url}`);
    console.log("Press Ctrl+C to stop.");
  });

program
  .command("record")
  .argument("<skill-id>")
  .description("Record a confirmed skill invocation. Implemented in Slice 5.")
  .action(() => {
    console.error("record is planned for Slice 5.");
    process.exitCode = 1;
  });

program
  .command("install")
  .argument("<skill-id>")
  .description("Install a managed skill from the sync repository.")
  .option("--force", "Overwrite an existing local copy")
  .action(async (skillId, options) => {
    const config = await loadLocalConfig();
    const record = await installRepoSkill(config, skillId, { force: options.force });
    console.log(`Installed ${record.id}`);
  });

program
  .command("remove-local")
  .argument("<skill-id>")
  .description("Remove a managed skill from this machine. Implemented in Slice 7.")
  .action(() => {
    console.error("remove-local is planned for Slice 7.");
    process.exitCode = 1;
  });

program
  .command("archive")
  .argument("<skill-id>")
  .description("Archive a managed skill in the sync repository. Implemented in Slice 7.")
  .action(() => {
    console.error("archive is planned for Slice 7.");
    process.exitCode = 1;
  });

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}
