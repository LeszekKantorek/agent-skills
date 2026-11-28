# Organize the procedure

## Goal

Arrange related actions and decisions so their scope, order, and dependencies are clear.

## Procedure

### Headings and independent instructions

Use headings to establish the scope of subordinate content. Give each section a purpose rather than a decorative label.

#### Subsections

Use deeper headings when a substantial section needs further subdivision. Preserve the heading hierarchy.

Use bullets for independent instructions:

* Group related instructions under their common subject.
* Keep qualifications within the item they affect.
* Use nested items when a distinction needs more detail:
  * Required checks apply to every relevant case.
  * Conditional checks apply when their stated condition holds.

### Ordered actions

1. Identify the intended result and available information.

2. Determine which actions and decisions are needed.

   Preserve the scope of the step by indenting its subordinate content.

   * Identify conditions that change the next action.
   * Keep unresolved conditions explicit.

   When alternatives share comparable criteria, keep the decision table within the step:

   | Finding | Next action |
   | --- | --- |
   | Confirmed discrepancy | Apply the supported correction. |
   | Competing explanations | Perform a distinguishing check. |
   | Missing evidence | Preserve the unresolved question. |

   Identify the relevant condition if none of these findings fits.

3. Check whether the result satisfies the intended outcome.

Use numbered headings for substantial steps containing multiple instructions or decisions.

### Navigation and dependencies

A text diagram can show alternative routes without turning every choice into a table:

```text
Need to describe a procedure
    ├── Independent actions ──→ Bullets
    ├── Ordered actions ──────→ Numbered steps
    └── Distinct branches ────→ Conditional instructions
                                or a decision aid
```

Use arrows for a short sequence when the relationships matter more than the details:

```text
Establish requirements → Design actions → Review result
```

Distinguish actions that depend on earlier results from independent actions that can run in parallel.

```text
Established requirements
    ├── Inspect existing behavior ──┐
    └── Examine proposed change ────┤
                                    ↓
                             Compare findings
```

### Delegated steps

Keep the lead agent's instructions focused on the overall goal, step responsibilities, and coordination. Describe individual steps in separate files when their execution needs distinct contexts.

```text
skill/
├── SKILL.md
└── steps/
    ├── 1-establish-content.md
    ├── 2-organize-procedure.md
    ├── 3-express-instructions.md
    └── 4-review-document.md
```

The [working example](../working-example.md) demonstrates an orchestration table with links to the actual steps. A step's goal and procedure establish its responsibility and the result needed by subsequent work.
