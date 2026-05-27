# Codex Skill Manager

Local CLI and Web UI for managing Codex skills across computers with a Git-backed sync repository.

Current scope includes local setup, skill scanning, editable Web UI, Git-backed sync, pull/update flows, archive/remove-local actions, explicit usage recording, and an optional Codex prompt hook for usage timestamps.

## Commands

```bash
yarn install
npm run build
node dist/src/cli.js init
node dist/src/cli.js status
node dist/src/cli.js pull
node dist/src/cli.js sync [skill-id...]
node dist/src/cli.js update-local <skill-id>
node dist/src/cli.js record <skill-id>
node dist/src/cli.js install-codex-hook
node dist/src/cli.js hook-status
node dist/src/cli.js serve
```

During development:

```bash
npm run dev -- init
npm run dev -- status
npm run dev -- pull
npm run dev -- sync [skill-id...]
npm run dev -- serve
```

Open the Web UI at `http://127.0.0.1:3017` by default.

On first launch, the Web UI asks for one sync repository directory. That directory is the part intended for Git commits and pushes. The Codex skills runtime directory defaults to `~/.codex/skills`, Agents skills default to `~/.agents/skills`, and the local-only cache defaults to `~/.codex-skill-manager/cache`.

On macOS, the `Choose` button opens the native folder picker through the local Node server. Advanced path fields remain available for existing repos, non-default Codex installs, testing paths, remote shells, and platforms where the native picker is not available yet.

After initialization, use the Settings view to change the sync repository, Codex skills directory, Agents skills directory, or local cache directory. The sync repository is the only path intended for Git commits and pushes. The local cache is machine-specific and should not be synced.

Skills are managed by top-level folders under the configured Codex and Agents skills directories. If a folder such as `gstack/` contains nested `SKILL.md` files, Skill Manager treats `gstack/` as one sync unit and hashes/copies the whole folder.

## Sync Workflow

- `Pull` runs a fast-forward-only Git pull and refuses to run while the sync repo has local uncommitted changes.
- `Auto-sync local modifications` continuously commits and pushes tracked local changes to the sync repo once they stabilize.
- `Add to sync` imports unmanaged local skills, then commits/pushes repo metadata and `SKILL.md` for those skills.
- `Install local` restores a missing local skill from the sync repo.
- `Update local` applies a repo-changed skill to this machine and blocks conflicts.
- `Resolve conflict` chooses one source (`Codex`, `Agents`, or repo), applies it as truth, updates metadata, and syncs that repo change.
- `Compare versions` shows snapshots for the Codex, Agents, and repo copies of a skill.
- `Stop syncing` moves a managed repo copy to `archive/`, marks it as archived, and stops active tracking. Local copies stay on this machine.
- `Restore` moves `archive/<skillId>` back to `skills/<skillId>`, re-activates managed status, and syncs that metadata change.
- `Remove local` deletes the skill copy from this machine only. It does not archive or delete the repo copy.
- `Archive` view lists archived skills and supports restoring from the Web UI.
- `record <skill-id>` writes a privacy-limited usage event containing only `skillId`, `invokedAt`, and `source`.

## Usage Tracking

`record <skill-id>` is the explicit path for confirming a skill was used.

The optional Codex hook installs one `UserPromptSubmit` command into `~/.codex/hooks.json`. It parses the submitted prompt for explicit `SKILL.md` links or paths under the configured Codex and Agents skill directories, then records only the matched `skillId` and timestamp. It does not read transcripts, project paths, hostnames, session ids, or tool output.

Install it from Settings in the Web UI, or run:

```bash
node dist/src/cli.js install-codex-hook
```

Codex may ask you to review and trust the hook before it runs. If you are developing from source, build first so the hook can call the compiled CLI.

## Default Paths

- Web sync repository: no default; choose a Git-backed directory during setup
- CLI sync repository: `~/codex-skills-sync` when `CSM_SYNC_REPO` is not set
- Codex skills: `~/.codex/skills`
- Agents skills: `~/.agents/skills`
- Local app config: `~/.codex-skill-manager`
- Local app cache: `~/.codex-skill-manager/cache`

For tests or experiments, override paths with:

```bash
CSM_SYNC_REPO=/tmp/codex-skills-sync \
CSM_CODEX_SKILLS_DIR=/tmp/codex-skills \
CSM_AGENTS_SKILLS_DIR=/tmp/agents-skills \
CSM_CONFIG_DIR=/tmp/csm-config \
npm run dev -- init
```

Use `CSM_CACHE_DIR` as well when running tests or smoke checks that should avoid the real local cache:

```bash
CSM_CONFIG_DIR=/tmp/csm-config \
CSM_CACHE_DIR=/tmp/csm-cache \
CSM_SYNC_REPO=/tmp/codex-skills-sync \
CSM_CODEX_SKILLS_DIR=/tmp/codex-skills \
CSM_AGENTS_SKILLS_DIR=/tmp/agents-skills \
npm run dev -- serve
```

Use `CODEX_HOME` or `CSM_CODEX_HOME` to test hook installation without touching the real `~/.codex` directory.
