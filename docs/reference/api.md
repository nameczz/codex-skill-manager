# API Reference

The Web UI talks to the local Fastify server. These APIs are local-only.

## Status

`GET /api/status`

Returns configuration, skill status, Git branch status, auto-sync status, and usage monitoring status.

## Sync Actions

| Endpoint | Purpose |
| --- | --- |
| `POST /api/import` | Add a local-only skill to the sync repo |
| `POST /api/install` | Install a repo-only skill locally |
| `POST /api/update-local` | Apply repo changes to a local skill |
| `POST /api/stop-syncing` | Remove a skill from sync tracking |
| `POST /api/remove-local` | Remove local installed copies |
| `POST /api/sync` | Commit and push managed skill changes |
| `POST /api/pull` | Pull remote sync repo changes |

## Codex Archive

| Endpoint | Purpose |
| --- | --- |
| `GET /api/codex-archive?state=active\|trash` | List archived sessions |
| `POST /api/codex-archive/preview` | Load a limited session preview |
| `POST /api/codex-archive/delete` | Move an archived session to trash |
| `POST /api/codex-archive/restore` | Restore a trashed archived session |

Archive APIs only accept `.jsonl` basenames and reject path traversal.
