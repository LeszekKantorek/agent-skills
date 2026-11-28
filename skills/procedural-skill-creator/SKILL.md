---
name: procedural-skill-creator
description: Create or revise agent skills as executable procedures with clear decisions, connected actions, and verifiable results.
metadata:
  version: "2.0.0"
---

# Create executable skills

## Goal

Create the smallest skill that reliably guides an agent from available inputs to the intended result.

## 1. Establish the capability

Identify the intended outcome, conditions of use, inputs, prerequisites, and boundaries from the user's request.

Locate and inspect relevant sources:

- Project instructions, documentation, existing procedures, and related skills.
- Supplied examples, previous work, and evidence of actual execution.
- Scripts, tools, and platform contracts that the procedure depends on.

Distinguish established requirements from proposals and illustrative material. Resolve conflicting guidance against its authority, scope, and applicability. Ask when missing information prevents a correct decision.

For a scoped revision, preserve established behavior outside the requested change.

## 2. Design the procedure

Work backward from the outcome to determine which results, decisions, and prerequisites are needed. Arrange actions in dependency order, with each result supporting a later action or the final outcome.

For decisions that affect execution, establish the criteria, alternatives, consequences, and next action. Handle incomplete evidence without assuming a successful result. Preserve uncertainty until it can be resolved or reported.

Identify what the agent can do using its existing capabilities and what requires additional instructions, resources, or tools.

Distinguish how the work is performed from the structure of its deliverable. Define the checks needed to establish completion.

## 3. Create or update the skill

Use [working-example.md](references/working-example.md) as a reference for expressing instructions in Markdown, not as a prescribed structure or set of tasks.

Create or update `SKILL.md` in English with the name, selection description, and procedure derived from the capability.

Place supporting resources where the agent can access them. Identify when each resource is needed and avoid requiring unrelated reading.

## 4. Verify the skill

Review the skill against the established capability and procedure:

- Matching requests select it; unrelated requests remain distinguishable.
- Each action has the necessary inputs, and its possible results lead to a valid next action or completion.
- Required decisions, constraints, exceptions, and unresolved cases remain covered.
- The skill contains only guidance needed to execute the procedure.
- Metadata, resources, and required helpers are usable.

Correct problems and save the skill and its resources in the requested location.

When execution is available, test selection with matching and nonmatching requests. Run representative tasks, including a consequential exception, and compare results with expected behavior. Repeat affected checks after corrections.

Report completed checks, unresolved problems, and untested behavior. Distinguish inspection from observed execution.
