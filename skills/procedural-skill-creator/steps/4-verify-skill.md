# Verify the skill

## Goal

Independently establish whether the skill's instructions and resources are consistent with its intended outcome and designed procedure.

## Procedure

Review the skill against the established capability and procedure.

### Red flags and diagnosis

Investigate relevant signals, including those not listed below. Propose a correction only when the examination establishes a problem.

| Signal | Examine | Possible correction |
| --- | --- | --- |
| Activity without a result | What must the action establish? Who needs it? | Define the necessary result or remove the action if it serves no purpose. |
| Missing dependency or assumed success | What information is unavailable? What if the preceding action yields a partial or alternative result? | Establish the prerequisite or handle the alternative outcome. |
| Ambiguous decision | Which interpretations lead to different behavior? Do examples or criteria distinguish them? | Supply distinguishing criteria or a relevant example. |
| Conflicting parallel work | Do actions share mutable state or depend on unestablished results? | Separate the responsibilities or order the dependent actions. |
| Unclear delegated responsibility | Which participant establishes the result? | Clarify the boundary or combine overlapping work. |
| Repeated instruction | Does each occurrence govern a different action or decision, or merely restate another instruction? | Consolidate redundant guidance; retain distinct uses. |
| Generic advice or excessive restriction | Does it identify an action, decision, or condition that changes the result? | Make useful guidance concrete; remove unnecessary restrictions. |
| Overcompression | Which condition, exception, rationale, or evidence limit was lost? | Restore the consequential distinction. |
| Borrowed requirement | Does the obligation come from an established requirement or only an example? | Remove unsupported obligations. |
| Authoring instruction in the result | Does it help the executing agent or only tell the author how to write? | Keep authoring guidance out of the produced skill. |

### Consider the complete procedure

- Could an agent follow every instruction correctly and still fail to achieve the declared outcome?
- Can each supported path reach a valid result or an explicit unresolved condition?
- Would a proposed correction resolve the cause or only its visible symptom?
- Which other actions, decisions, or resources could be affected by the correction?

### Verification

Confirm:

- [ ] The name and description distinguish intended requests from relevant near-misses.
- [ ] The complete procedure covers the established outcome and responsibilities.
- [ ] Each action has the necessary information, and its possible results lead to a valid next action or completion.
- [ ] Required decisions, constraints, exceptions, and unresolved cases remain covered.
- [ ] The skill contains only guidance needed to execute the procedure.
- [ ] Metadata, resource links, and required helpers are usable; Markdown structure preserves the scope of instructions.
- [ ] For orchestrated skills, responsibilities, execution conditions, dependencies, and expected results are sufficient to coordinate the steps.

Report completed checks, supported findings, affected steps, proposed corrections, and unresolved problems to the lead agent. Identify any questions that require actual execution to resolve.
