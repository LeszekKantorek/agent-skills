---
name: procedural-skill-creator
description: Create or revise agent skills as executable procedures with clear decisions, connected actions, and verifiable results.
metadata:
  version: "2.0.0"
---

# Create executable skills

## Goal

Create the smallest self-contained skill that guides an agent from available inputs to the intended result.

## 1. Establish the capability

Use the user's request, supplied procedures, examples, and relevant existing skills to identify:

- Intended result, recognizable requests, and scope.
- Available inputs, prerequisites, and constraints.
- Decisions the agent cannot reliably make without guidance.
- Established requirements, unresolved choices, and illustrative material.

For a scoped revision, preserve existing behavior outside the requested change. Investigate unresolved requirements; ask when missing information prevents a correct decision.

## 2. Design the procedure

Arrange actions around the results they produce and the information they depend on. Each result must support a later action or the final outcome.

Define the decisions that affect execution, including their criteria, consequences, and handling of incomplete evidence. A branch must lead to an applicable action, an explicit unresolved condition, or completion.

Separate the procedure from the deliverable's structure. A list of output fields does not explain how to obtain their values.

Use existing agent capabilities and project conventions without restating them. Include additional guidance where ordinary judgment is insufficient or an error would change the result.

## 3. Write the skill

Read [authoring-context.md](references/authoring-context.md) for examples of instructional forms. Adapt the forms to the capability; do not copy the examples' sections, workflow, or requirements.

Write a concise frontmatter description that identifies when the skill applies. State its intended outcome and the actions needed to achieve it. Organize the body according to the work, not a fixed authoring template.

Write in English using direct verbs and concrete objects. Keep related conditions, exceptions, and actions together.

- Use short paragraphs for connected instructions and conditional actions.
- Use bullets for independent instructions or grouped choices.
- Number actions when their order matters. Use headings for substantial steps.
- Use examples, code blocks, and diagrams when they clarify syntax, structure, or consequential distinctions.
- Use tables for genuine comparisons, repeated fields, or mappings. Prefer direct conditional instructions for simple decisions.
- Use checklists when individual completion items must be verified.

Distinguish illustrative alternatives from exhaustive contract values. Do not introduce obligations solely because an example contains them.

Keep the main skill sufficient for execution. Link detailed references, scripts, or examples only when they add necessary guidance; identify when to use them.

## 4. Reduce and verify

Remove duplicated instructions, repeated introductions, generic quality advice, and unnecessary examples or intermediate checkpoints. Retain conditions, rationale, and distinctions that affect execution. Do not impose a word or token limit at the expense of correctness.

Check the draft against the original need:

- Matching requests select the skill; unrelated requests remain distinguishable.
- Actions use available inputs and lead to the intended result, including exceptions and unresolved cases.
- Essential requirements and boundaries survive the revision.
- Metadata, Markdown structure, resource paths, and required helpers are usable.

Correct identified problems. Save the skill and necessary resources in the requested location.

When execution is available, test skill selection with matching and nonmatching requests and run representative tasks, including a consequential exception. Compare observed results with expected behavior. Repeat affected checks after corrections.

Report validation performed, unresolved problems, and untested behavior. Do not present text inspection as observed agent execution.
