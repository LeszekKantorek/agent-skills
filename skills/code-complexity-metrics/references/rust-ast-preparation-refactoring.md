# Split Rust AST preparation into stages

`prepare()` combined recursive AST copying, macro recovery, function discovery, diagnostics, and presentation. Macro recovery contained the deepest nesting because the copy loop also handled malformed delimiters, parser selection, and doc attribute validation.

1. **Try a local refactor.** We separated macro handling from the copy loop and removed repeated checks. The prototype lowered all three metrics while keeping the work inside one outer function.
2. **Choose explicit stages.** Readability was our priority when choosing between the two options, so we favored the lower whole-file Cognitive Complexity. We split source mapping, syntax copying, function discovery, diagnostics, and presentation into named functions. This made `prepare()` read in execution order. Compared with the local prototype, we accepted higher Cyclomatic Complexity and Statement Count for 10 fewer Cognitive points. [Staged implementation](../scripts/analyzers/rust/analyze-ast.mjs)

| Whole-file scores | Cognitive | Cyclomatic | Decisions excluding base points | Statement Count |
| --- | ---: | ---: | ---: | ---: |
| Original | 120 | 89 | 88 | 262 |
| Local prototype | 95 | 81 | 80 | 244 |
| Staged implementation | 85 | 99 | 82 | 263 |

The staged version added 16 Cyclomatic base points by creating more outer functions. Statement Count covers the reported functions. The staged version also has two declarations at module scope outside that count.
