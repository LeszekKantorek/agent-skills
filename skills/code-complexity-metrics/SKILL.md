---
name: code-complexity-metrics
description: Measure Cognitive Complexity, Cyclomatic Complexity, and Statement Count for Rust and JavaScript source functions using the bundled local analyzer.
---

# Code Complexity Metrics

## Usage

* Replace `<skill-dir>` with the absolute path to this skill's directory.
* Run commands from the project directory. Relative input and output paths use that working directory.

```text
Usage:
  node "<skill-dir>/scripts/measure.mjs" [options]

Requirements:
  Node 24 LTS.
  Verified platform: Windows.
  The complete skill directory, including scripts/ and vendor/.
  No npm install, compilation, or internet connection is required.

Options:
  --path "<file-or-glob>"  Rust .rs or JavaScript .js input.
                           Repeat for multiple files or patterns. Quote globs.
  --format <format>        json (default), markdown, or csv.
  --filter "prefix|other"  Select outer names by case-sensitive prefixes.
                           Separate alternative prefixes with |.
  --explain                Markdown with scoring comments beside the source.
                           No summary table. Comments align within each outer.
                           Overrides --format and replaces original comments
                           in the report copy.
  --output "<file>"        Write the report to a file instead of standard output.

Examples:
  node "<skill-dir>/scripts/measure.mjs" --path "src/lib.rs"
  node "<skill-dir>/scripts/measure.mjs" --path "src/**/*.rs" --path "web/**/*.js" --format markdown
  node "<skill-dir>/scripts/measure.mjs" --path "src/**/*.rs" --format csv --filter "load|save" --output "complexity.csv"
  node "<skill-dir>/scripts/measure.mjs" --path "web/**/*.js" --explain --output "complexity.md"

Notes:
* An outer is a function without an enclosing function.
* Each outer record includes its nested functions and closures.
* All requested or matched files are analyzed, without additional exclusions.
* Unmatched globs add no files. With no input files, the report is empty.
* CSV begins with three # metadata lines before its header.

Exit codes:
* 0  No error.
* 1  An error occurred. A report can still contain results from valid files.
```

## Use the results in code review

* Use the report to identify functions that need closer review and to track complexity changes between revisions.
* The measurements describe syntax. They do not establish correctness, architectural quality, or runtime performance.

### Understand the three signals

Keep the metrics separate when selecting code to inspect:

| Metric | Meaning | Review focus |
| --- | --- | --- |
| Cognitive Complexity | An indicator of difficulty understanding control flow, including nesting. | Inspect nested decisions and interruptions to linear reading. |
| Cyclomatic Complexity | A count of decision constructs under this project's rules, with one base point per outer. | Inspect conditions, alternatives, and the tests covering their behavior. The score is not a required number of tests. |
| Statement Count | Implementation size measured through statements and operations, including explicit calls. | Inspect long sequences of work and whether the function combines distinct responsibilities. |

* A large Statement Count can accompany simple control flow. A short function can contain deeply nested decisions.
* For example, three flat `if` statements score Cognitive 3, while three nested `if` statements score Cognitive 6.
* Both score Cyclomatic 4 when they are the only decisions in an outer.

### Investigate a result

1. Select functions with increased scores or comparatively large values among functions with similar responsibilities.

   * This skill defines no quality thresholds. Do not label code defective or recommend refactoring solely because of a score.

2. Run `--explain` for the selected outer using its file and name prefix.

   * Inspect the scored constructs and the original source, including comments omitted from the explanation.
   * Nested functions and closures contribute to the outer's result.

3. Evaluate those constructs against the function's responsibilities and expected behavior during the separate code review.

   * Record concrete findings with source locations, metric evidence, and consequences for understanding, testing, or maintenance.
   * If the structure is justified, state that no change is warranted by the measurement alone.

### Compare revisions

* Measure both revisions with the same analyzer, rules, input scope, and filter.
* Match corresponding functions using their source context. Locations can change, and names need not be unique.
* Explain each metric's change using the changed constructs and required behavior.
* When code moves into another outer, inspect both functions. A lower score in the original function can reflect redistribution.
* After an authorized refactoring, rerun measurements and relevant behavior tests. A lower score alone does not prove improvement.
* Treat `null` as unavailable. Identify incomplete runs before drawing conclusions from missing functions or comparing reports.
