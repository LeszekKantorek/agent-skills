# Test the skill

## Goal

Establish through actual execution whether the skill produces the intended results under representative conditions.

## Procedure

### Design tests

Derive realistic test requests and expected results from the established capability.

- **Selection:** Which requests exercise the essential capability? Which closely related requests should not select the skill?
- **Execution:** Which scenarios distinguish correct behavior from a plausible incorrect interpretation? Which missing inputs or consequential exceptions could expose weaknesses?
- **Orchestration:** Which applicable cases exercise dependency order, independent actions, alternative paths, and delegation?

Consider whether the expected results can be established independently of the tested instructions. Could a test pass without exercising the instruction or decision it is meant to evaluate? Use observable criteria; apply qualitative judgment where results cannot be assessed objectively.

### Execute and compare

Run tests in fresh agent contexts when available. Ask the lead agent to arrange independent test runs when necessary.

For selection tests, make the skill available without explicitly invoking it. For execution tests, use the skill without supplying additional instructions that compensate for its deficiencies.

When evaluating an improvement, compare against the previous skill under equivalent conditions. For a new skill, compare against execution without the skill when useful. Keep test requests, supplied information, and relevant execution conditions comparable. Consider result quality, time, and token usage where measurable.

### Interpret observed behavior

Compare observed results with expected behavior. Examine execution records, tool actions, and intermediate results when needed to explain failures or unnecessary work.

**Correct result.** Determine whether the intended behavior was exercised. Compare with a baseline when available before attributing the result to the skill.

**Incorrect or partial result.** Identify which expectation was not met and the decision, interpretation, or action that may have caused it. Distinguish an appropriately reported limitation from an execution failure.

**Incorrect selection.** Examine the selection description, capability boundaries, competing skills, and whether activation can be observed.

**Unnecessary work.** Identify instructions or dependencies that cause operations without contributing to the result.

**Inconsistent results.** Examine whether variation comes from ambiguous guidance, model behavior, or execution conditions. Repeat relevant cases when needed to distinguish plausible causes.

**Orchestration problems.** Examine whether the lead agent respects dependencies, intended parallelism, and execution conditions, and whether each delegate receives the relevant information and establishes its expected contribution.

**Baseline differences.** Identify meaningful improvements and regressions. Distinguish observed differences from causal explanations and limitations of the comparison.

Before proposing a change, determine whether a failure is an isolated case or reveals a broader class of problems. Identify related cases that could verify a generalized correction.

Report observed results, failures, likely causes, and affected instructions to the lead agent. State which tests could not be performed and the limitations of the test environment. Do not substitute inspection for execution.
