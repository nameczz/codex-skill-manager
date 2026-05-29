# Security Policy

## Supported Versions

Security fixes are provided for the latest `main` branch state.

## Reporting a Vulnerability

Please do not open public issues for sensitive vulnerabilities.

Report privately with:
- Impact summary
- Reproduction steps
- Affected components/files
- Suggested remediation (optional)

If a secure contact mailbox is not yet configured, open a minimal GitHub issue that only requests a private reporting channel and excludes exploit details.

## Security Boundaries

This project is local-first and manages:
- Local Codex/Agents skill directories
- A user-selected Git sync repository
- Local metadata/cache for usage and sync state

Please pay special attention to:
- Path traversal or unsafe file operations
- Incomplete Git operation validation
- Unauthorized access to local directories
- Accidental data exfiltration in logs or UI

## Disclosure Process

1. Acknowledge receipt.
2. Triage and reproduce.
3. Prepare patch and tests.
4. Release fix and publish advisory notes in `CHANGELOG.md`.
