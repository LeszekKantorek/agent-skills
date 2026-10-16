---
name: procedural-skill-creator
description: Use to create or revise skills as executable procedures with clear decisions, connected steps, and verifiable results.
---

# Create Executable Skills

## Goal

Create skills that guide agents through connected actions and justified decisions, from available inputs to verifiable results.

## Steps

1. **Establish the capability and its boundaries.**

* Establish what the skill must achieve, when it applies, and what work it covers.
* Use the user's intent, supplied procedures, examples, and relevant existing skills.
* For a scoped revision, retain established design choices. Apply the relevant steps to the requested change.
* Use the questions below to establish the outcome, inputs, decisions, and boundaries.

| Question | Establish | Example |
| --- | --- | --- |
| What change should execution produce? | A concrete outcome | Preserve project decisions so future work can use their rationale and conditions. |
| What request should select this skill? | A recognizable need and conditions of use | Save findings from a completed investigation. |
| What does the agent start with? | Available inputs, prerequisites, and their limits | A session contains observations, accepted decisions, and unresolved proposals. |
| Which decisions require guidance? | Choices that affect the result | Choose what merits preservation and where its context belongs. |
| What work belongs within this capability? | Its responsibility and boundary with adjacent work | Preserve new findings. Inspect related records. Broader reorganization belongs to collection maintenance. |
| What is established, and what remains open? | Accepted requirements and constraints, distinguished from examples, proposals, and unresolved choices | An audit report appears in a supplied example. Whether the new skill needs one remains undecided. |

* Use the table as a starting point for analysis. Formulate other questions when needed to understand the capability and its boundaries. Examine these questions.
* Continue when the outcome, conditions of use, inputs, and responsibility are clear and unresolved requirements or design choices are explicit.

2. **Design the flow of decisions and results.**

* Define how the target skill will use its inputs to achieve its intended result within the scope from Step 1.
* Arrange actions into steps according to the information they require and the results needed by subsequent steps.
* Use the table to check the role of each proposed step.

| Design question | Establish | Correction when unclear |
| --- | --- | --- |
| What does this step achieve? | A useful change in understanding, selection, or artifact state | Replace activity labels such as “analyze” with the result the analysis must establish. |
| What does it use? | Supplied material or an earlier result | Move prerequisite work earlier or identify the missing input. |
| What decision or transformation happens here? | The operation that produces the result | Specify the action needed to produce the result from the available inputs. Combine steps that repeat analysis without producing distinct results. |
| What consumes its result? | A later decision, action, or final deliverable | Remove work that does not support the skill's outcome. |
| What happens when the evidence is incomplete? | A useful branch, retained gap, or focused clarification | Avoid requiring a confirmed answer when the next step can investigate alternatives. |
| How is completion recognized? | A condition that permits the next action or completes the task | Match the condition to work actually performed at this stage. |

* Examine other design questions when the flow remains unclear. Adapt the steps to the work required.
* Continue when each step produces a useful result. Each supported branch must lead to another action or identify an unresolved condition.

3. **Write the instructions and decision aids.**

* Express the flow from Step 2 as instructions that specify actions, their objects, and relevant conditions.
* Write a short frontmatter description for skill selection. State the outcome in a one-sentence Goal. Organize actions into numbered steps.
* State each step's purpose, inputs, and necessary guidance. Add decision aids when they clarify a choice or ambiguity.
* Use the table to select a suitable form.

| Need | Useful form | Include when |
| --- | --- | --- |
| Understand source contributions | Question / Identify / Example | The agent must interpret varied material before acting. |
| Select a response | Condition / Action | Different findings require different actions. |
| Transform source content | Source contribution / Result / Example | The agent must preserve meaning while changing representation. |
| Distinguish alternatives | Option / Choose when / Consequence | Selection depends on conditions or trade-offs. |
| Check and correct a result | Check / Expected result / Correction | A failed check should lead to a specific correction. |
| Show a consequential distinction | A filled example or before/after pair | An abstract instruction leaves plausible but materially different interpretations. |

* Adapt the form when no listed option supports the decision. For open tables, explain what to do when no row fits.
* Preserve established constraints when adapting examples or decision aids.
* Place guidance for interpreting a decision aid after that aid. State when the step is complete. Combine points that serve one purpose.
* Use filled examples to clarify choices or results when needed. Present fictional tasks as illustrations, not instructions to execute.
* Keep the procedure self-contained when practical. Add resources only when execution or conditional reading requires them.
* Consult [authoring-examples.md](references/authoring-examples.md) when an instruction remains unclear or a step needs a concrete model.
* Save the skill and required resources in the requested location.
* Continue when the skill expresses the intended flow, with essential context and unresolved requirements visible.

4. **Remove repetition without losing decisions.**

* Remove text that adds no useful guidance. Preserve the instructions and distinctions needed to achieve the intended result.
* Review the draft from Step 3, including tables and examples, against the scope and outcome established in Step 1.
* Use the table to select the appropriate revision.

| Signal | Examine | Revision |
| --- | --- | --- |
| Generic quality advice | Does it identify a decision, object, or check? | Replace it with concrete guidance or remove it. |
| Repeated enumeration | Does a bullet restate the table immediately below? | Keep a short instruction explaining how to use the table. |
| Repeated protection | Is the same distinction already operational in a question, example, or check? | Remove the extra warning while retaining the operative distinction. |
| Borrowed process rule | Does this task require the report, approval gate, commit, or fixed sequence used by an example? | Retain only requirements supported by the current task. |
| Authoring instruction in the result | Does this tell the author how to write rather than the executing agent what to do? | Keep it in creation guidance instead of the produced skill. |
| Necessary recurrence | Does the concept serve a different decision at each occurrence? | Retain distinct uses, such as choosing a source, updating it, and checking it. |
| Overcompression | Did shortening remove a condition, reason, exception, or evidence limit that affects action? | Restore the missing distinction. |

* Choose another revision when the listed options do not address the problem.
* Continue when each retained passage supports execution and the procedure still achieves its intended outcome.

5. **Check the complete procedure against representative use.**

* Check the complete procedure against the scope, inputs, outcome, requirements, and unresolved choices established in Step 1. Check that it follows the flow designed in Step 2.
* Compare the description and Goal with the complete procedure after the revisions in Step 4.
* Use the table to identify problems and select corrections.

| Check | Expected result | Correction |
| --- | --- | --- |
| Selection | A matching request selects the skill. A nearby unrelated request remains distinguishable. | Clarify its description or responsibility boundary. |
| Step connections | Each step uses available inputs and leaves a result its successor can use | Correct missing prerequisites, repeated analysis, or unsupported transitions. |
| Branch continuity | Uncertainty and alternative outcomes survive into the next applicable step | Replace an assumed successful result with the actual supported alternatives. |
| Goal coverage | The complete workflow produces what the Goal promises | Adjust the procedure or Goal to the agreed responsibility. |
| Decision quality | Tables and examples enable choices rather than repeat slogans | Supply relevant criteria or remove an unhelpful aid. |
| Completion | The final check compares the result with original needs, including unresolved items | Restore dropped needs or make their unresolved state explicit. |
| Structure and resources | Metadata, paths, references, and any executable helpers are usable | Correct structural errors and exercise helpers relevant to the change. |

* Add checks when the table does not cover a consequence that could affect execution.
* To check agent behavior, run a representative task with the target skill. Compare the result with the intended outcome.
* Check skill selection with matching and nonmatching requests.
* Correct problems. Repeat the affected checks.
* State which checks you performed and what remains untested. Distinguish text review and structural checks from observed agent behavior.
* Identify unresolved problems and explain why they remain unresolved.
