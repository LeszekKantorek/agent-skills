# Design the procedure

## Goal

Design the actions and decisions needed to achieve the established capability.

## Procedure

Work backward from the intended outcome to identify the results needed to achieve it. Define each action by the result it must establish, rather than the activity it performs.

### Examine proposed steps

Consider questions such as:

- What does this step establish: a finding, decision, transformation, or completed result?
- What information or preceding results does it depend on?
- Which operation or decision produces the result? Which criteria distinguish the alternatives and their consequences?
- What subsequent action or final outcome needs its result?
- What alternative results are possible, including partial findings or missing information?
- What happens when an assumption fails or evidence is incomplete?
- How is completion recognized?
- Would a separate agent improve this step's execution or assessment?

### Arrange the procedure

Connect actions according to their dependencies and execution conditions:

- **Sequential:** establish prerequisite results before dependent actions.
- **Parallel:** run independent actions concurrently when useful and avoid conflicting changes. Combine their required results before dependent work.
- **Conditional:** select actions according to established conditions and handle alternative or unresolved results explicitly.

For example, independent investigations can converge into a decision with more than one supported outcome:

```text
Reported discrepancy
    ├── Read expected behavior ──┐
    └── Inspect observations ────┤
                                 ↓
                          Compare findings
                                 ├── Cause supported → Correct → Recheck
                                 └── Cause uncertain → Investigate or report gap
```

Consider the complete flow:

- Which actions repeat work or produce results that nothing needs? Remove them or combine actions that do not need separate responsibilities.
- Which decisions should precede expensive or irreversible work?
- When a result needs correction, which dependent actions must be repeated?
- What can the executing agent do with its existing capabilities, and what requires additional guidance, resources, or tools?

Keep uncertainty visible until it can be resolved or reported. Distinguish the operations that produce a deliverable from the structure of the deliverable itself.

### Choose the execution approach

**Direct execution.** Use a single agent when the procedure is self-contained and its actions benefit from a shared context.

**Orchestrated execution.** Delegate steps when distinct responsibilities, context requirements, or independent assessment justify separate agents. Establish each step's contribution to subsequent work. Consider whether delegation reduces context complexity enough to justify coordination and whether the execution environment supports it.

Define the checks needed to establish completion. Provide the procedure design and unresolved design choices to the lead agent.
