# Limitations

The analyzer measures the Rust and JavaScript syntax written in source files. It does not resolve types, identify call targets, or count executed paths.

## Source interpretation

Rust macros count as single statements. The analyzer does not expand their contents. Rust `cfg` conditions do not filter the source.

Cognitive Complexity follows the [generic metric rules](../scripts/rules/generic-metric-rules.md) with the relevant [Rust rules](../scripts/rules/rust-metric-rules.md) or [JavaScript rules](../scripts/rules/javascript-metric-rules.md). This profile does not claim compatibility with an external analyzer.

The `location` value contains a file path, line, and column. Its value can change when source lines move.

## Rust async blocks

Rust async blocks follow the rules for extra blocks and implicit return values. The analyzer does not treat `async` as an additional function boundary.

For example, `let c = || async { work() };` contributes four Statements:

* One declarator.
* One extra block.
* One call.
* One implicit return.

## Verified environment

The supported runtime is Node 24 LTS. Verification so far covers Windows.
