# Create or update the skill

## Goal

Create a skill that expresses the established capability and designed procedure.

## Procedure

### Use the working example

Use [working-example.md](../references/working-example.md) to explore ways of expressing instructions and organizing delegated procedures. Its numbered topics are independent examples, not phases of authoring or a prescribed skill template.

Consult the files relevant to the instructions being written:

```text
../references/
├── working-example.md                          # Scope, orchestration table, linked steps
└── steps/
    ├── 1-express-actions.md                    # Direct instructions, grouped lists, scope
    ├── 2-express-conditions-and-decisions.md   # Conditions, alternatives, tables, decision trees
    ├── 3-express-sequences-and-dependencies.md # Ordered steps, parallel branches, coordination
    ├── 4-express-technical-content.md          # Code, directory trees, examples, links, diagrams
    └── 5-express-verification-criteria.md      # Acceptance criteria, checklists, red flags, corrections
```

Use the relevant examples to express the designed procedure. Adapt their form to the work rather than copying their technical scenarios.

### Determine the necessary guidance

Consider what the executing agent needs to perform the designed actions:

- **Knowledge and interpretation:** What domain or project information is needed? Which distinctions or evidence limits affect interpretation?
- **Decisions:** Which choices require explicit criteria and consequences? Where could different interpretations produce materially different behavior?
- **Actions:** Which operations, conditions, exceptions, or prerequisites need to be stated for execution to proceed correctly?
- **Examples:** Would a concrete example distinguish plausible interpretations better than another instruction?
- **Tools:** Could an existing tool or reusable script perform a deterministic or repeated operation?
- **Conditional knowledge:** Which information is needed only for particular tasks or outcomes?

Provide the guidance that addresses these needs. Keep examples illustrative unless their content is an established requirement.

### Express the capability and procedure

Create or update `SKILL.md` in English. Use YAML frontmatter with `name` and `description`. The description identifies the capability, intended requests, and consequential exclusions. State the intended outcome of the complete procedure.

Choose the structure that implements the execution approach established during design.

**Direct execution**

Keep the procedure in `SKILL.md`.

```text
skill-name/
└── SKILL.md
```

**Orchestrated execution**

Use `SKILL.md` to guide the lead agent. Link the delegated steps and describe their responsibilities, expected results, dependencies, and conditions for execution. Place their instructions in `steps/<number>-<step>.md` files focused on the goal and procedure.

```text
skill-name/
├── SKILL.md
└── steps/
    ├── 1-collect.md
    └── 2-compare.md
```

### Organize supporting resources

Include resources according to the work. For example, a skill may use:

```text
skill-name/
├── SKILL.md
├── steps/       # Delegated procedures
├── references/  # Supporting knowledge
├── scripts/     # Reusable executable operations
└── assets/      # Templates and other resources used in execution
```

Link supporting resources from the instructions that need them. Identify when to consult a resource rather than require unrelated reading.

Save the skill and its required resources in the requested location. Provide the created or updated skill to the lead agent for verification.
