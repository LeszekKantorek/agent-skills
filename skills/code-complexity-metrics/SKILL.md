---
name: code-complexity-metrics
description: Measure and explain Cognitive Complexity and Halstead Volume for Rust and JavaScript functions. Use the bundled local analyzer to review control flow, implementation size, and changes between revisions.
---

# Code Complexity Metrics

## Scoring rules

The [generic metric rules](scripts/rules/generic-metric-rules.md) define Cognitive Complexity, Halstead Volume, and recursive composition. Read them with the [Rust mappings](scripts/rules/rust-metric-rules.md) or [JavaScript mappings](scripts/rules/javascript-metric-rules.md) when interpreting or changing scoring rules.

Rules version: **2.1**. Recognized Rust macro arguments contribute recursively. Unsupported syntax produces diagnostics.

Reports record the application version. Derive new combinations from shared rules. Request a new rule for a genuine classification gap or conflict.

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
  --path "<file-or-glob>"  Rust .rs or JavaScript .js or .mjs input.
                           Repeat for multiple files or patterns. Quote globs.
  --format <format>        json (default), markdown, or csv.
  --filter "prefix|other"  Select outer names by case-sensitive prefixes.
                           Separate alternative prefixes with |.
  --explain                Markdown with source and numeric metric columns.
                           Each outer includes its metrics and Halstead counts.
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
  node "<skill-dir>/scripts/measure.mjs" --path "web/**/*.js" --explain --output "complexity.md"

Notes:
* An outer is a function without an enclosing function.
* Each outer record includes its nested functions and closures.
* All requested or matched files are analyzed, without additional exclusions.
* Unmatched globs add no files. With no input files, the report is empty.
* CSV begins with three # metadata lines before its header.
* Function records contain `name`, `location`, `metrics`, `halstead_counts`, and `error`.
  The metrics are `cognitive_complexity` and `halstead_volume`. The Halstead counts are
  `n1` and `n2` for occurrences, and `eta1` and `eta2` for distinct items. Locations use
  `file:line:column:length`; read the three numeric fields from the right.
  Paths are relative to the working directory when possible. Lines and columns
  start at 1; columns and lengths use UTF-16 units.
* Every error is reported on standard error and results in exit code 1. When at least one input is analyzed successfully or confirmed to have an unsupported language, a partial report is published to standard output or atomically to `--output`. A failed write leaves the destination unchanged. Input aliases are protected.
* Both metrics exclude contributions assigned to physical lines covered by diagnostics.
  `Error` identifies the first relevant diagnostic. An empty cell or JSON null means no relevant error.
  Discovery completeness remains a separate field.

* 0  No error.
* 1  An error occurred. A partial report can be published when a reliable input result is available.
```

## Use the results in code review

Cognitive Complexity describes how control flow and nesting affect reading. Three flat `if` statements score 3, while three nested `if` statements score 6. Use the annotated source to see where those points come from.

Halstead Volume measures the number and variety of operators and operands in the function body, including nested functions. It can flag a large implementation with simple control flow. Inspect which operations account for the volume and whether they belong together.

The [JSON report schema](references/report-schema.json) defines the fields for automated comparisons.

### Investigate a result

1. Select functions with increased scores or comparatively large values among functions with similar responsibilities. Keep the two metrics separate.

   * This skill defines no quality thresholds. Do not label code defective or recommend refactoring solely because of a score.

2. Run `--explain` for the selected outer using its file and name prefix.

   * Inspect Cognitive points and the Halstead count changes in the annotated source. Consult the original comments when needed.
   * Nested functions and closures contribute to the outer's result.

3. Evaluate those constructs against the function's responsibilities and expected behavior during the separate code review.

   * Record concrete findings with source locations, metric evidence, and consequences for understanding, testing, or maintenance.
   * If the structure is justified, state that no change is warranted by the measurement alone.

### Compare revisions

* Measure both revisions with the same analyzer, rules, input scope, and filter.
* Match corresponding functions using their source context. Locations can change, and names need not be unique.
* Explain each metric's change using the changed constructs and required behavior. Use the Halstead counts to distinguish changes in occurrences from changes in the number of distinct items.
* When code moves into another outer, inspect both functions. A lower score in the original function can reflect redistribution.
* After an authorized refactoring, rerun measurements and relevant behavior tests. A lower score alone does not prove improvement.
* Identify incomplete runs and functions with `Error` before comparing results. Scores with an error exclude affected physical lines.

### Historical refactoring cases

These cases use analyzer version 1.x and include the metrics it reported at the time.

* [Rust statement scorer](references/rust-statement-scorer-refactoring.md) uses two refactoring passes and changes which metric guides the second pass.
* [Rust AST preparation](references/rust-ast-preparation-refactoring.md) splits traversal work into named stages.
* [Named AST conditions](references/named-ast-conditions.md) uses named conditions and `find()` predicates to describe what the code checks.
* [Aggregation](references/aggregation-refactoring.md) removes repeated work before extracting stages.
