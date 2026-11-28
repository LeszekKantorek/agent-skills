---
name: procedural-skill-creator
description: Create or revise agent skills as executable procedures with clear decisions, connected actions, and verifiable results.
metadata:
  version: "2.0.0"
---

# Create executable skills

## Goal

Create the smallest skill that reliably guides an agent from available information to the intended result.

## Orchestration

As the lead agent, coordinate the steps below. Delegate each step to a separate subagent with its instructions, relevant user requirements, and the results it needs from preceding steps.

| Step | Responsibility and expected result |
| --- | --- |
| [1. Establish the capability](steps/1-establish-capability.md) | Investigate the request and relevant sources. Establish the capability, boundaries, requirements, and unresolved choices. |
| [2. Design the procedure](steps/2-design-procedure.md) | Determine the actions, decisions, dependencies, and execution responsibilities needed to achieve the capability. |
| [3. Create or update the skill](steps/3-create-skill.md) | Implement the designed procedure as a skill with its necessary resources. |
| [4. Verify the skill](steps/4-verify-skill.md) | Independently review the instructions, dependencies, and resources against the capability and design. Identify defects and unresolved problems. |
| [5. Test the skill](steps/5-test-skill.md) | Execute representative tasks. Establish whether skill selection, execution, and results meet expectations. |

Use each result to guide the next applicable step. For scoped revisions, retain established behavior and execute the affected steps, including verification and testing.

Resolve blockers with the user when necessary. Return to the affected steps when verification or testing identifies problems and repeat the affected checks and tests.

If subagents are unavailable, report the limitation rather than claim independent execution.

Report the completed skill, verification findings, and test results.
