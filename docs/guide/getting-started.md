# Getting Started

## Prerequisites

- Node.js 20 or newer
- Git
- macOS for the native directory picker
- A local folder or Git clone to use as the skill sync repository

## Install

```bash
yarn install
```

## Run the Local Web UI

```bash
npm run dev -- serve
```

The server listens on `http://127.0.0.1:3017` by default.

## First Setup

1. Choose the Git sync repository directory.
2. Initialize the manager.
3. Add local-only skills to sync.
4. Let auto-sync watch managed skills, or use manual actions when needed.

## Common Commands

```bash
npm run dev -- status
npm run dev -- pull
npm run dev -- sync <skill-id>
npm run dev -- update-local <skill-id>
npm run dev -- stop-syncing <skill-id>
```
