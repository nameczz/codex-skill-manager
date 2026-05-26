# Product

## Register

product

## Users

Personal Codex power users who maintain skills across multiple computers. They are comfortable with local tools and Git, but they come to this interface to avoid manually comparing directories, remembering what changed, or risking accidental overwrites.

Their main job is to quickly confirm that managed skills are safe to sync, understand which skills are out of date or unused, and recover cleanly when local and repository copies diverge.

## Product Purpose

Codex Skill Manager is a local tool for managing Codex skills through an independent Git-backed sync repository. It makes the relationship between the sync repository and `~/.codex/skills` visible, actionable, and safe.

Success means a user can open the Web UI, know whether sync is safe, import or update a skill confidently, and avoid accidental deletion or unintended pushes.

## Brand Personality

Expert, restrained, precise.

The interface should feel like a reliable workbench for people who care about their tools. It should be calm under pressure, direct about risks, and sharp enough that a frequent user can move quickly without being surprised.

## Anti-references

- Not a flashy AI SaaS dashboard with decorative gradients, inflated metrics, or marketing copy.
- Not a dense Git GUI that makes every operation feel like a merge crisis.
- Not a toy utility with vague labels, cute decoration, or casual treatment of destructive actions.

## Design Principles

- Sync safety first: the first thing users should understand is whether managed skills are clean, changed, or conflicted.
- Make scope explicit: every action must clarify whether it affects this machine, the sync repository, or both.
- Prefer earned density: show enough state for power users to scan quickly, but keep hierarchy strong enough that conflict and risk stand out.
- Trust through evidence: expose hashes, paths, timestamps, and change sources when useful, without dumping raw logs or private context.
- Familiar controls over novelty: use standard product UI patterns so the tool feels dependable and learnable.

## Accessibility & Inclusion

Target WCAG AA. The product must support keyboard navigation, visible focus states, sufficient contrast, non-color status indicators, reduced-motion preferences, and clear language for error and destructive states.
