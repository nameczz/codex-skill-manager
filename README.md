# Codex Skill Manager

Local CLI and Web UI for managing Codex skills across computers with a Git-backed sync repository.

This repository is at Slice 2: CLI setup, sync repository initialization, skill scanning, metadata, status reporting, and the first local Web UI.

## Commands

```bash
yarn install
npm run build
node dist/src/cli.js init
node dist/src/cli.js status
node dist/src/cli.js serve
```

During development:

```bash
npm run dev -- init
npm run dev -- status
npm run dev -- serve
```

Open the Web UI at `http://127.0.0.1:3017` by default.

On first launch, the Web UI asks for one sync repository directory. That directory is the part intended for Git commits and pushes. The Codex skills runtime directory defaults to `~/.codex/skills`, Agents skills default to `~/.agents/skills`, and the local-only cache defaults to `~/.codex-skill-manager/cache`.

On macOS, the `Choose` button opens the native folder picker through the local Node server. Advanced path fields remain available for existing repos, non-default Codex installs, testing paths, remote shells, and platforms where the native picker is not available yet.

After initialization, use the Settings view to change the sync repository, Codex skills directory, Agents skills directory, or local cache directory. The sync repository is the only path intended for Git commits and pushes. The local cache is machine-specific and should not be synced.

Skills are managed by top-level folders under the configured Codex and Agents skills directories. If a folder such as `gstack/` contains nested `SKILL.md` files, Skill Manager treats `gstack/` as one sync unit and hashes/copies the whole folder.

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
