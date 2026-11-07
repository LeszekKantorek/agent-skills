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
### 2. Determine which differences change meaning

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

The example illustrates these distinctions:

* The table supplies criteria.
* It does not yet command edits: a later step selects and applies corrections.
* This separation matters when a difference is intentional or unresolved.

## A procedure that needs no table

A small coordination skill can have three steps.

### Example

```markdown
1. Locate pending items. Identify which inputs are available.
2. Pass available items to the established processing procedure. Wait for its result.
3. Mark completed items. Retain incomplete items with their reasons.
```

A table would only restate the sequence when these choices are already clear.

## Choosing Markdown structure

Choose Markdown elements according to the relationships between instructions, conditions, and information. Use structure to preserve meaning, scope, and execution order.

Select the appropriate form:

| Information | Markdown form |
| --- | --- |
| Document title | `#` |
| Major topic | `##` |
| Subsection or substantial procedure step | `###` |
| Independent instructions | `*` |
| Grouped alternatives | Labeled `*` items |
| Ordered actions | `1.`, `2.`, `3.` |
| Important qualification or quotation | `>` |
| Exact identifiers or short commands | Inline backticks |
| Multiline code or literal examples | Fenced code block |
| Comparable fields or conditional actions | Table |

### Headings

Use headings to establish the scope and hierarchy of document sections.

Apply these rules:

* Use one `#` heading for the title of a standalone document.
* Use `##` for major topics, such as Goal and Steps.
* Use `###` for subdivisions, including substantial procedure steps with their own instructions or decision tables.
* Preserve heading hierarchy without skipping levels.
* Keep subordinate content under the heading that governs it.
* Do not create a heading merely to decorate a short passage.

Example:

```markdown
# Review a proposed change

## Goal

Establish whether the proposed change preserves accepted requirements.

## Steps

### 1. Identify affected requirements

Locate the requirements governing the proposed change.

### 2. Compare the change with evidence

Check differences against their sources and retain unresolved cases.
```

### Independent instructions

Use bullets when instructions apply independently and do not require an execution order.

Apply these rules:

* Introduce a list with a short sentence explaining its purpose when the context does not already establish it.
* Use `*` consistently for unordered lists.
* Keep explanations and qualifications within the item they affect.
* Group related items under their common subject.
* Do not use single newlines as substitutes for bullet markers.
* Avoid repeating the heading in an introductory sentence when the heading already identifies the list.

Example:

```markdown
Check the proposed content against these requirements:

* Preserve original technical meaning.
* Retain conditions and exceptions.
* Keep unresolved claims explicit.
* Associate evidence with the claims it supports.
```

### Grouped choices

Use a compact bullet list when available options can be grouped by a shared characteristic, purpose, or condition.

Apply these rules:

* Introduce the list with a sentence identifying what can be selected and whether the options are alternatives rather than mandatory actions.
* Use one bullet per meaningful group.
* Start each item with a short group label followed by a colon.
* Place related options on the same line, separated by commas and a final `or` when appropriate.
* Keep group labels and options concise, parallel, and easy to scan.
* State whether the reader must select one option or may select several when the distinction matters.
* Distinguish an exhaustive set of allowed values from illustrative examples.
* Do not split every option into a separate bullet when the options share a meaningful category and require no individual explanation.
* Use nested lists when individual options require explanations.
* Use a decision table instead when selecting an option requires comparing conditions, consequences, or trade-offs.

Example:

```markdown
Choose one format for presenting the result:

* **For quick review:** summary, checklist, or comparison.
* **For execution:** procedure, command sequence, or runbook.
* **For reference:** specification, catalog, or structured record.
```

### Ordered procedures

Use numbered lists when actions must occur in a particular order.

Apply these rules:

* Introduce the procedure with a sentence establishing its purpose when needed.
* Use numbered items for actions whose order matters.
* Keep subordinate instructions within the step they qualify.
* Indent subordinate bullets, paragraphs, and tables beneath the corresponding numbered item.
* Preserve blank lines where needed to separate nested Markdown blocks.
* Place information governing the whole procedure outside individual steps.
* Use `###` headings instead when individual steps contain substantial explanations or several decision aids.

Example of a short procedure:

```markdown
Complete the review in this order:

1. Locate the affected requirements.
2. Compare proposed changes with their sources.
3. Record findings and unresolved questions.
```

Incorrect: the bullets and table are detached from Step 2.

```markdown
1. Locate the affected claims.
2. Compare each claim with its source.

* Preserve original units.
* Record unsupported changes.

| Difference | Action |
| --- | --- |
| Changed value | Check its source. |

3. Report the findings.
```

Correct: subordinate instructions and the table belong to Step 2.

```markdown
Complete the review in this order:

1. Locate the affected claims.

2. Compare each claim with its source.

   Check the following properties:

   * Preserve original units and thresholds.
   * Identify removed conditions.
   * Record unsupported claims.

   Select the next action from the evidence:

   | Finding | Action |
   | --- | --- |
   | Confirmed mismatch | Correct the affected claim. |
   | Competing explanations | Check distinguishing evidence. |
   | Missing evidence | Retain the unresolved question. |

3. Report the findings and remaining limitations.
```

### Blockquotes

Use blockquotes to distinguish quotations or important qualifications from surrounding content.

Apply these rules:

* Use `>` for quotations or distinct qualifications.
* Keep section-wide qualifications before narrower subsections.
* Place step-specific constraints beside their affected instructions.
* Do not move mandatory actions into a blockquote merely for visual emphasis.
* Avoid decorative callouts that add no meaningful distinction.

Example:

```markdown
## Validation

> Desktop validation does not establish mobile-device compatibility.

### Browser checks

* Verify the layout at supported desktop sizes.
* Inspect captured screenshots.
```

### Code blocks

Use code formatting to preserve exact technical content.

Apply these rules:

* Use inline backticks for identifiers, paths, configuration values, and short commands.
* Use triple-backtick fences for multiline code, commands, and literal examples.
* Specify a language after the opening fence when applicable.
* Use `markdown` to demonstrate literal Markdown source.
* Use a longer outer fence when an example contains an inner fenced block.
* Preserve exact syntax in commands and code examples.
* Do not enclose ordinary explanations in code fences for emphasis.

Example of a command:

````markdown
Run the verification command:

```sh
python verify.py
```
````

### Tables

Use tables when rows share comparable fields or when conditions determine alternative actions.

Apply these rules:

* Give columns consistent meanings.
* Keep each row independently interpretable.
* Preserve conditions and constraints shared across rows when omitting them would change meaning.
* Introduce the decision or relationship before the table when its purpose is not already clear.
* Keep table guidance next to the table it qualifies.
* Use bullets instead when items are independent obligations without common comparison fields.
* Use numbered lists instead when the content represents sequential actions.
* Remove tables that merely repeat adjacent instructions.

Example:

```markdown
Select the next action from the available evidence:

| Evidence | Next action |
| --- | --- |
| Confirmed cause | Apply the supported correction. |
| Several plausible causes | Perform a distinguishing check. |
| Insufficient evidence | Preserve the unresolved diagnosis. |
```

### Combining Markdown elements

Combine Markdown elements when they express different relationships within the same document.

Check the resulting structure against these requirements:

* Headings establish the correct scope for subordinate content.
* Introductory sentences identify the purpose of lists and tables when necessary.
* Numbered lists preserve execution order.
* Bullets express independently applicable instructions.
* Grouped choices distinguish alternatives from mandatory actions.
* Subordinate bullets, tables, and explanations remain attached to the step they qualify.
* Blockquotes distinguish qualifications without hiding required actions.
* Fenced blocks preserve literal syntax.
* Tables represent meaningful comparisons or decisions.
* Paragraphs retain explanations whose sentences form one connected idea.

Inspect rendered Markdown as well as its source. Correct structural ambiguities without changing requirements, conditions, or accepted decisions.

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

Distinguish open knowledge categories from closed values defined by a contract.

Apply these rules:

* Use open categories when classifying requirements, decisions, procedures, evidence, or other contributions whose roles may vary.
* Preserve useful information that does not fit an existing category. Identify its additional role rather than forcing it into an unsuitable row.
* Retain historical explanations when they affect future interpretation or decisions.
* Treat explicitly defined protocol values, states, and enumerations as closed sets.
* Do not invent new contract values merely because an existing value does not fit the observed case.
* Apply flexibility to knowledge organization, not to established technical contracts.

Example:

```markdown
Classify the source by its contribution:

| Contribution | Preserve |
| --- | --- |
| Requirement | Expected behavior and applicable conditions |
| Decision | Selected approach and rationale |
| Evidence | Observations and their limitations |

* Record other useful contributions when these categories do not describe their role.
* Preserve historical explanations when they affect future decisions.

For protocol status, accept only these values:

* `active`
* `paused`
* `closed`

Do not introduce additional status values without changing the protocol contract.
```

## Goal and description

Use the description to identify when the skill applies. Use the Goal to state the outcome of its complete procedure.

Apply these rules:

* Write a description that identifies the recognizable request and the skill's responsibility.
* State the complete intended outcome in the Goal.
* Match the Goal to all actions the skill actually performs, including corrections and verification when applicable.
* Do not promise implementation when the skill only investigates or reviews.
* Keep the description, Goal, and procedure consistent with the agreed scope.
* Derive the wording from the skill's responsibility rather than copying an example.

Example of a diagnostic skill that investigates, corrects, and verifies behavior:

```markdown
---
name: diagnose-and-correct
description: Investigate observed failures, apply authorized corrections, and verify their effects.
---

# Diagnose and correct failures

## Goal

Identify why behavior fell short, apply a targeted correction, and check its effect.
```

For a skill limited to review, use a narrower Goal:

```markdown
---
name: review-failure
description: Review reported failures and identify supported findings without changing implementation.
---

# Review reported failures

## Goal

Identify supported causes, competing explanations, and unresolved questions without applying corrections.
```

## Procedure versus deliverable template

Distinguish instructions for performing work from the structure of the resulting artifact.

Apply these rules:

* Define how the agent transforms available inputs into the required result.
* Include the decisions and checks needed to produce the result, not only its fields or headings.
* Place field-specific instructions beside the corresponding fields when they help execution.
* Allow different output structures when the material requires them.
* Use fixed fields only when the task or output contract requires them.
* Keep authoring guidance in the creator skill rather than copying it into the produced skill.
* State what the executing agent must do, not how the skill author should choose its instructions.

Example:

```markdown
### 2. Connect requests to knowledge sources

* Identify recurring requests and the knowledge needed to answer them.
* Locate the relevant source sections.
* Map each request to the section that supplies the required knowledge.
* Add fields when needed to preserve important conditions or source limitations.

| Request | Knowledge needed | Source |
| --- | --- | --- |
| Diagnose startup failure | Startup conditions and failure behavior | Startup procedure |
| Validate browser layout | Geometry requirements and acceptance checks | Presentation specification |

* Check that each mapping supports the intended request.
* Record missing or ambiguous sources explicitly.
```

The example demonstrates an executable procedure rather than a table template alone. Its instructions determine how the table is populated and checked.