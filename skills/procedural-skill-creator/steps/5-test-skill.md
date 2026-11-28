# Test the skill

## Goal

Establish through actual execution whether the skill produces the intended results under representative conditions.

## Procedure

### 1. Design test cases

Derive realistic requests and expected behavior from the established capability.

- **Selection:** include matching requests and near-misses that should not select the skill.
- **Execution:** include representative tasks, consequential exceptions, and missing information.
- **Orchestration:** exercise applicable dependencies, parallel actions, conditional paths, and delegation.

Consider:

- Which cases distinguish correct behavior from a plausible incorrect interpretation?
- Can the expected result be established independently of the skill's instructions?
- Could a test pass without exercising the instruction or decision it is intended to evaluate?

Use observable criteria and qualitative judgment where objective checks are insufficient.

### 2. Configure and execute the tests

Choose the execution mode according to what the case examines.

**Selection test.** Make the skill available without explicitly invoking it. Observe whether the agent selects it.

**Execution test.** Use the skill without adding instructions that compensate for its deficiencies.

Choose the baseline according to the purpose:

- **Improving an existing skill:** compare against the previous version under equivalent conditions.
- **Creating a new skill:** compare against execution without the skill when useful.

Keep test requests, supplied information, and relevant execution conditions comparable. Run tests in fresh agent contexts when available. Ask the lead agent to arrange independent test runs when necessary.

Capture actual results, skill activation where observable, and relevant execution evidence. Measure time and token usage where available.

### 3. Assess the results

Compare the observed behavior with the expected result.

```text
Test evidence
    ├── Insufficient evidence ──→ Report unverified behavior
    ├── Meets expectation ──────→ Confirm observed behavior
    └── Differs from expectation → Investigate the discrepancy
```

An appropriately reported limitation or unresolved condition can satisfy a test when it matches the expected behavior. If activation cannot be observed, leave selection unverified even when the task result is correct.

For orchestrated skills, check that the lead agent respects dependencies, intended parallelism, and execution conditions, and that delegates receive relevant information and establish their expected contributions.

When a baseline is available, compare result quality, time, and token usage where measurable. Identify improvements and regressions; a correct result alone does not establish that the skill contributed to it.

### 4. Investigate unexpected behavior

Examine execution records, tool actions, and intermediate results when needed to explain discrepancies or unnecessary work.

| Observation | Examine |
| --- | --- |
| Incorrect selection | Description, capability boundaries, competing skills, and observable activation. |
| Incorrect or incomplete result | Which decisions, interpretations, or actions could explain the unmet expectation. |
| Unnecessary work | Instructions or dependencies that introduce operations without contributing to the result. |
| Inconsistent results | Ambiguous guidance, model behavior, or differences in execution conditions. |
| Orchestration problem | Responsibility boundaries, dependency order, and missing or excessive context. |

Distinguish observed differences from possible causes. Investigate other explanations when needed; repeat relevant cases to distinguish them.

### 5. Recommend changes and report

Determine whether a failure is an isolated case or reveals a broader class of problems. Identify the affected instructions and related cases that could verify a generalized correction.

Report observed results, meaningful baseline differences, failures, likely causes, and proposed corrections to the lead agent. Identify tests that could not be performed and the limitations of the environment. Do not substitute inspection for execution.
