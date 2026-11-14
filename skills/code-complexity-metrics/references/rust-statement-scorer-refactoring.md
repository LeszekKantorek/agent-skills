# Refactor the Rust statement scorer in two passes

The original `statements()` was a recursive AST visitor with nested branches. It chose how to score and traverse each node based on its syntax and context, including the scope of `break`.

1. **Reduce all three metrics.** We named the grammar checks and separated `break` scope. Cognitive, Cyclomatic, and Statement Count all fell.
2. **Optimize for Cognitive Complexity.** We dropped the requirement to reduce all three metrics. This led to `StatementVisitor`, which split the traversal into methods with less nesting. Cognitive fell by **42 points**. We accepted increases of **2 Cyclomatic points** and **3 statements**.

| Whole-file scores | Cognitive | Cyclomatic | Statement Count |
| --- | ---: | ---: | ---: |
| Original | 135 | 101 | 196 |
| First pass | 106 | 87 | 187 |
| Second pass | 64 | 89 | 190 |

The three metrics can move in different directions. When nested branches make a visitor hard to follow, splitting the traversal by behavior can substantially lower Cognitive Complexity. A small increase in Cyclomatic Complexity and Statement Count can be worth that trade-off.
