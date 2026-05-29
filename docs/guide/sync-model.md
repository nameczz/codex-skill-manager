# Sync Model

The app treats the sync repository as the portable source for selected skills, while local Codex and Agents folders remain machine-specific runtime copies.

## States

| State | Meaning |
| --- | --- |
| Clean | Local and repo copies match |
| Local changed | Local copy changed and should be synced to repo |
| Repo changed | Repo copy changed and should be applied locally |
| Conflict | Local and repo copies both changed |
| Missing local copy | Repo has a managed skill not installed locally |
| Local only | Skill exists locally but is not tracked in the repo |

## Stop Syncing

Stop syncing removes the skill from the sync repository and metadata. It does not delete local installed skill copies.

After refresh, a remaining local copy appears as `Local only`.

## Auto-Sync

Auto-sync watches managed skills and commits/pushes local changes when possible. Manual actions are still available for explicit recovery and conflict resolution.
