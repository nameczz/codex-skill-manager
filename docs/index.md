# Codex Skill Manager

Local-first workbench for syncing Codex and Agents skills through a Git repository.

## What It Does

- Tracks selected local skills in a sync repository.
- Applies repo changes back to local Codex or Agents skill folders.
- Watches managed skills for auto-sync.
- Shows Codex archived sessions with soft-delete and restore.
- Keeps local cache and machine-specific configuration out of Git.

## Start Here

```bash
yarn install
npm run dev -- serve
```

Open `http://127.0.0.1:3017`.

See [Getting Started](./guide/getting-started.md) for the full flow.
