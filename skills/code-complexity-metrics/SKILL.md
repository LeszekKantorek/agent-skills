---
name: code-complexity-metrics
description: Measure Cognitive Complexity, Cyclomatic Complexity, and Statement Count for Rust and JavaScript source functions using the bundled local analyzer.
---

# Code Complexity Metrics

Replace `<skill-dir>` with the absolute path to this skill's directory.
Run commands from the project directory. Relative input and output paths use that working directory.

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
                           Overrides --format and replaces original comments
                           in the report copy.
  --output "<file>"        Write the report to a file instead of standard output.

Examples:
  node "<skill-dir>/scripts/measure.mjs" --path "src/lib.rs"
  node "<skill-dir>/scripts/measure.mjs" --path "src/**/*.rs" --path "web/**/*.js" --format markdown
  node "<skill-dir>/scripts/measure.mjs" --path "src/**/*.rs" --format csv --filter "load|save" --output "complexity.csv"
  node "<skill-dir>/scripts/measure.mjs" --path "web/**/*.js" --explain --output "complexity.md"

Notes:
  An outer is a function without an enclosing function.
  Each outer record includes its nested functions and closures.
  All requested or matched files are analyzed, without additional exclusions.
  Unmatched globs add no files. With no input files, the report is empty.
  CSV begins with three # metadata lines before its header.

Exit codes:
  0  No error.
  1  An error occurred. A report can still contain results from valid files.
```
