# Establish the content

## Goal

Identify the instructions and information needed to achieve the intended result.

## Procedure

Name each action, its object, and the conditions that affect its result. Keep a connected explanation or conditional instruction in a short paragraph.

If several actions depend on the same condition, state it once within the scope it governs.

**Activity-oriented:** ~~Analyze the sources carefully.~~

**Result-oriented:** Identify which claims describe the same behavior under the same conditions.

The second instruction specifies a comparison the agent can perform.

### Establish scope

Use a short introduction to distinguish information that must be understood together.

* Requirements establish the conditions the result must satisfy.
* Evidence establishes what is supported and what remains uncertain.
* Decisions establish the chosen approach and its rationale.

Preserve useful contributions that do not fit these categories.

Use a selection description to identify recognizable requests and relevant situations. Include a nearby exclusion when it prevents the wrong procedure from being selected.

```yaml
name: review-requirements
description: Review proposed requirement changes against their sources. Use when assessing whether a revision preserves agreed behavior, not when implementing an already approved change.
```

### Preserve exact distinctions

For a protocol with a closed status enumeration, accept only:

* `active`
* `paused`
* `closed`

Do not extend the set without changing the contract.

> A missing status is not equivalent to `paused`.

A blockquote can distinguish an important qualification or quotation. Keep required actions in the procedure.

Use **bold** for meaningful distinctions, *italics* for emphasis or qualifications, and inline code for exact identifiers, paths, and values.
