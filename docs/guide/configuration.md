# Configuration

Codex Skill Manager stores machine-local configuration outside the sync repository.

## Paths

| Path | Purpose |
| --- | --- |
| Sync repo | Git-tracked skills and metadata |
| Codex skills | Local `~/.codex/skills` runtime folder |
| Agents skills | Local `~/.agents/skills` runtime folder |
| Cache | Local-only app state |

The sync repository is the only folder intended for Git commits. The cache directory should never be synced.

## Environment Overrides

For isolated tests, use temporary paths:

```bash
CSM_SYNC_REPO=/tmp/csm-sync \
CSM_CODEX_SKILLS_DIR=/tmp/csm-codex \
CSM_AGENTS_SKILLS_DIR=/tmp/csm-agents \
CSM_CONFIG_DIR=/tmp/csm-config \
CSM_CACHE_DIR=/tmp/csm-cache \
npm run dev -- serve
```

## Git Remote

If the sync repository has an upstream remote, the manager can show whether local changes need to be pushed or remote changes need to be pulled.
