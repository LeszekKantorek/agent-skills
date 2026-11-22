---
name: code-complexity-metrics
description: Measure and explain control flow, implementation size, and call dependencies for Rust and JavaScript functions with the bundled local analyzer.
---

# Code Complexity Metrics

## Scoring rules

The [generic metric rules](scripts/rules/generic-metric-rules.md) define Cognitive Complexity, Halstead Volume, Fan-In, Fan-Out, and Instability. Read them with the [Rust mappings](scripts/rules/rust-metric-rules.md) or [JavaScript mappings](scripts/rules/javascript-metric-rules.md) when interpreting results.

Rules version: **2.5**. Recognized Rust macro arguments contribute recursively. Unsupported syntax produces diagnostics.

Reports record the application version.
Derive new combinations from shared rules. Request a new rule for a genuine classification gap or conflict.

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
  --path "<file-or-glob>"  Rust .rs or JavaScript .js or .mjs files to report.
                           Repeat for multiple files or patterns. Quote globs.
  --format <format>        json (default), markdown, or csv.
  --filter "prefix|other"  Select outer names by case-sensitive prefixes.
                           Separate alternative prefixes with |.
  --explain                Markdown with source, local score columns, and metric totals.
                           Instability is NaN when Fan-In and Fan-Out are both zero.
                           Overrides --format and omits the summary table.
                           Rows inside multiline literals keep their original text.
                           Their numbers appear below the block with the line number.
                           Original comments are omitted when parsing succeeds;
                           a parse error preserves the complete source text.
  --output "<file>"        Write the report to a file instead of standard output.

Examples:
  node "<skill-dir>/scripts/measure.mjs" --path "src/lib.rs"
  node "<skill-dir>/scripts/measure.mjs" --path "src/**/*.rs" --path "web/**/*.js" --format markdown
  node "<skill-dir>/scripts/measure.mjs" --path "src/**/*.rs" --format csv --filter "load|save" --output "complexity.csv"
  node "<skill-dir>/scripts/measure.mjs" --path "scripts/input-files.mjs" --filter "languageFor" --explain

Notes:
* An outer is a function without an enclosing function.
* Each outer record includes its nested functions and closures.
* All requested or matched files are analyzed, without additional exclusions.
* Unmatched globs add no files. With no input files, the report is empty.
* CSV begins with three # metadata lines before its header.
* Markdown and CSV show the same summary, five metrics, and Error column.
  Use JSON for full precision, Halstead counts, call graph details, and diagnostics.
  Use `--explain` to inspect score increments, confirmed callers, and unresolved outgoing calls.
  In each JSON function record, `call_graph.fan_in` contains `callers_count` and `callers`.
  `call_graph.fan_out` contains `unresolved_count` and `unresolved_calls`.
* Function records contain `name`, `location`, `metrics`, `halstead_counts`, `call_graph`, and `error`.
  The metrics are `cognitive_complexity`, `halstead_volume`, `fan_in`, `fan_out`, and
  `instability`. Reports show `NaN` for Instability when both call counts are zero.
  JSON uses the string `"NaN"` for that case. The Halstead counts are
  `n1` and `n2` for occurrences, and `eta1` and `eta2` for distinct items. Locations use
  `file:line:column:length`; read the three numeric fields from the right.
  Paths are relative to the working directory when possible. Lines and columns
  start at 1; columns and lengths use UTF-16 units.
* Report input errors appear on standard error and set exit code 1. A usable input allows
  the CLI to publish a partial report. A failed write leaves the destination unchanged.
  The CLI protects input files, including graph sources and input aliases.
* Cognitive Complexity and Halstead Volume exclude contributions on physical lines covered by diagnostics.
  `Error` identifies the first relevant diagnostic. Markdown and CSV show `None` when a function has no relevant error. JSON uses `null`.
  Discovery completeness remains a separate field.
* The call graph covers the projects containing the report files. `--path` and `--filter` select
  what appears in the report.
* The project's boundary is the nearest enclosing Git repository. Outside Git, use the nearest
  Cargo or Node.js manifest. For sources without these markers, run from the project directory.
  The scan skips independent nested projects, installed `node_modules`, and Cargo build directories.
  A dependency or build file selected for reporting gets a graph limited to that file.

* 0  No error.
* 1  An error occurred. A partial report can be published when a reliable input result is available.
```

## Use the results in code review

Cognitive Complexity describes how control flow and nesting affect reading. Three flat `if` statements score 3, while three nested `if` statements score 6. Use the annotated source to see where those points come from.

Halstead Volume measures the number and variety of operators and operands in the function body, including nested functions. It can flag a large implementation with simple control flow. Inspect which operations account for the volume and whether they belong together.

Fan-In counts distinct resolved callers. Fan-Out counts distinct call destinations from an outer's body, including nested functions. Use the resolved definition when available and the written path when the definition is unknown. Rust macro invocations also contribute by their written paths.

Instability is Fan-Out divided by the sum of Fan-In and Fan-Out.

The [JSON report schema](references/report-schema.json) defines the fields for automated comparisons.

### Investigate a result

1. Select functions with increased scores or comparatively large values among functions with similar responsibilities. Interpret each metric separately.

   * This skill defines no quality thresholds. Do not label code defective or recommend refactoring solely because of a score.

2. Run `--explain` for the selected outer using its file and name prefix.

   * Inspect Cognitive points and the Halstead count changes in the annotated source. Consult the original comments when needed.
   * Inspect confirmed callers and unresolved outgoing calls before drawing conclusions from the graph metrics.
   * Nested functions and closures contribute to the outer's result.

3. Evaluate those constructs against the function's responsibilities and expected behavior during the separate code review.

   * Record concrete findings with source locations, metric evidence, and consequences for understanding, testing, or maintenance.
   * If the structure is justified, state that no change is warranted by the measurement alone.

### Compare revisions

* Measure both revisions with the same analyzer, rules, input scope, and filter.
* Match corresponding functions using their source context. Locations can change, and names need not be unique.
* Explain each metric's change using the changed constructs and required behavior. Use the Halstead counts to distinguish changes in occurrences from changes in the number of distinct items.
* Compare dependency metrics over the same projects and inspect any changes in unresolved calls.
* When code moves into another outer, inspect both functions. A lower score in the original function can reflect redistribution.
* After an authorized refactoring, rerun measurements and relevant behavior tests. A lower score alone does not prove improvement.
* Identify incomplete runs and functions with `Error` before comparing results. Scores with an error exclude affected physical lines.

### Historical refactoring cases

These cases record metrics from earlier development of the analyzer.

* [Rust statement scorer](references/rust-statement-scorer-refactoring.md) uses two refactoring passes and changes which metric guides the second pass.
* [Rust AST preparation](references/rust-ast-preparation-refactoring.md) splits traversal work into named stages.
* [Named AST conditions](references/named-ast-conditions.md) uses named conditions and `find()` predicates to describe what the code checks.
* [Aggregation](references/aggregation-refactoring.md) removes repeated work before extracting stages.
