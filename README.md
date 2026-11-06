# agent-skills

Version: 1.0.0

Skills for AI agents to create reusable procedures and write clear technical documentation. They help agents define actions, preserve meaning, and check results.

## Skills

| Skill | Purpose |
| --- | --- |
| [procedural-skill-creator](skills/procedural-skill-creator/SKILL.md) | Create or revise skills with clear actions, decisions, and completion checks. |
| [technical-writing-rules](skills/technical-writing-rules/SKILL.md) | Write, revise, or review English technical documentation while preserving facts and meaning. |

## Install the plugin from GitHub

```sh
codex plugin marketplace add LeszekKantorek/agent-skills --ref main
codex plugin add agent-skills@agent-skills
```

## Install with the skills CLI

```sh
npx skills add LeszekKantorek/agent-skills
```
