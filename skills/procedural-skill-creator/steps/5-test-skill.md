# Test the skill

## Goal

Establish through actual execution whether the skill produces the intended results under representative conditions.

## Procedure

Derive realistic test requests and expected results from the established capability, including:

- **Selection:** matching and closely related nonmatching requests.
- **Execution:** representative tasks and consequential exceptions or incomplete inputs.

Run the tests in fresh agent contexts when available. Use the skill without supplying additional instructions that compensate for its deficiencies. Ask the lead agent to arrange independent test runs when necessary.

Compare the observed results with the expected behavior. Examine the execution when needed to identify the cause of failures or unnecessary work. For orchestrated skills, check whether delegation and the exchange of relevant information actually support completion.

When evaluating an improvement, compare against the previous skill under equivalent conditions. For a new skill, compare against execution without the skill when useful. Consider result quality, time, and token usage where measurable.

Report the observed results, failures, likely causes, and affected instructions to the lead agent. State which tests could not be performed and the limitations of the test environment. Do not substitute inspection for execution.
