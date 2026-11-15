# Refactor aggregation in two passes

`aggregate()` combines results from both language analyzers. `collect()` validates the analysis tree and gathers scores by source row. Aggregation uses those rows to exclude points affected by diagnostics.

1. **Remove repeated work.** We combined two passes over affected rows and shared the code that calculates row ranges and compares diagnostics. The first pass lowered all three whole-file metrics.
2. **Make the stages explicit.** A prototype with named conditions lowered whole-file Cognitive to 213. We chose the staged variant for readability. It separates record validation and score collection from diagnostic merging and score projection. Whole-file Cognitive fell another 47 points from the first pass. [Staged implementation](../scripts/aggregation.mjs)

| Whole-file scores | Cognitive | Cyclomatic | Decisions excluding base points | Statement Count |
| --- | ---: | ---: | ---: | ---: |
| Original | 266 | 218 | 205 | 464 |
| After the first pass | 222 | 209 | 193 | 446 |
| After the second pass | 175 | 219 | 191 | 467 |

## Calculate decisions from the report

Each reported outer function or method contributes one Cyclomatic base point, even when its body is empty. Nested functions and closures add no separate base point. [Cyclomatic scoring rules](../scripts/rules/generic-metric-rules.md#base-and-decisions)

The CLI includes base points in Cyclomatic. The decision column is calculated separately for this comparison. Sum Cyclomatic across the complete, unfiltered file report, then subtract the number of reported function and method records.

After the first pass, 16 records give **209 − 16 = 193** decisions. After the second pass, 28 records give **219 − 28 = 191** decisions. The second pass added 12 base points and removed two decisions. We accepted 10 more Cyclomatic points and 21 more statements to make each stage easier to follow.
