# Authoring examples

These examples illustrate authoring decisions. Their fictional tasks are not requests to execute them. Adapt their structure to the intended capability.

## From a topic to a useful operation

| Weak instruction | More actionable instruction | Why it helps |
| --- | --- | --- |
| Analyze the documents carefully. | Identify which claims describe the same behavior under the same conditions. | Names the comparison and its scope. |
| Ensure quality. | Compare each requirement with its supporting result. Identify missing evidence. | Defines the objects and the check. |
| Improve the routing. | Connect each recurring request to the section that supplies the knowledge needed to proceed. | Defines the relation the agent must produce. |
| Keep the plan aligned. | Compare each planned change with the accepted scope. Explain additions or omissions. | Makes alignment inspectable. |

These are design illustrations, not measured improvements in model performance.

## A complete step with an open decision table

The fictional skill reviews a proposed documentation change. Earlier work identified the affected claims and their sources.

### Example

```markdown
**2. Determine which differences change meaning.**

* Identify differences that could change how readers interpret or apply the claims found in Step 1.
* Compare the original and proposed wording with their conditions and supporting sources.
* Use the table to distinguish editorial changes from changes requiring correction or a decision.

| Difference | Examine | Interpretation |
| --- | --- | --- |
| Changed wording | Do the same conditions lead to the same action? | Different phrasing may preserve meaning. |
| Removed condition | Does the claim now apply to additional situations? | A shorter sentence may broaden the rule. |
| Changed number | Does the source establish the new threshold? | An unsupported value changes the requirement. |
| Removed rationale | Is the reason needed to understand a choice or exception? | The statement may remain true but lose context needed for future decisions. |

* Examine another difference when none of these patterns explains a possible change in meaning.
* Continue when each consequential difference has an interpretation supported by its source or an explicit unresolved question.
```

* The table supplies criteria.
* It does not yet command edits: a later step selects and applies corrections.
* This separation matters when a difference is intentional or unresolved.

## A procedure that needs no table

A small coordination skill can have three steps:

### Example

```markdown
1. Locate pending items. Identify which inputs are available.
2. Pass available items to the established processing procedure. Wait for its result.
3. Mark completed items. Retain incomplete items with their reasons.
```

* If these choices are already clear, a table would only restate the sequence.

## Shortening without deleting the decision

Original:

> Use the table to select boundaries, content locations, and the maintenance arrangement.

After the previous bullet has already established these decisions:

> Use the table to make these decisions.

The shorter version works because the preceding bullet makes its meaning clear. It would be vague without that context.

Original:

> Choose steps and tables to fit the procedure; the resulting skill need not follow this skill's five-step structure.

Revision:

> Choose steps and tables to fit the procedure.

The shorter instruction still tells the agent to fit the structure to the procedure. Removing an exception that changes the permitted action would change the meaning.

## Repairing a broken handoff

| Earlier result | Broken next instruction | Connected instruction |
| --- | --- | --- |
| A supported cause or competing hypotheses | Apply a correction to the confirmed cause. | Perform a check that distinguishes the hypotheses or apply the supported correction. |
| Proposed changes, not yet performed | Continue when qualifications are preserved. | Continue when the context to retain is identified. |
| A list of problems, some without selected fixes | Verify each selected fix. | Check that each identified problem is resolved or remains explicit with its reason. |

## Keeping knowledge out of rigid categories

An open table lists requirements, decisions, procedures, and evidence. A source includes a useful historical explanation that fits no row cleanly. A useful instruction lets the agent describe the additional role and preserve the explanation when it affects future work.

A closed table lists protocol values `active`, `paused`, and `closed`. The agent must not invent another value because a case is inconvenient. Table flexibility applies to the first situation, not the second.

## Goal and description

The description indicates when to select the skill. The Goal states the outcome of the complete procedure.

For a diagnostic skill that investigates, changes, and checks behavior:

* Incomplete Goal: “Determine a correction supported by evidence.”
* More complete Goal: “Identify why behavior fell short, apply a targeted correction, and check its effect.”

For a skill that only produces a review, the shorter Goal could still promise too much. Derive the wording from the agreed responsibility rather than copying this example.

## Procedure versus deliverable template

A skill that produces a briefing may need instructions next to each briefing field. A skill that creates a knowledge map may produce several different table structures. Both are executable when they explain how to transform the material and assess the result.

Do not copy the creator's own authoring guidance into the produced skill. “Choose useful example columns” belongs to a creator. “Map each request to the relevant section” belongs to the mapping procedure.
