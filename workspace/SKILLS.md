# Skill Loader Manifest

## Loaded Skills

- **contractclaw** — Contract ingestion, extraction, registry, alerting, diffing, querying, and risk analysis.
  - Path: `./skills/contractclaw/SKILL.md`
  - Triggers: file upload (PDF/DOCX), contract queries, deadline checks

## Loading Configuration

Skills are auto-discovered from `./skills/` subdirectories.
Each subdirectory must contain a `SKILL.md` file as the entry point.

See `openclaw.json` → `skills.load.extraDirs` for additional skill search paths.
