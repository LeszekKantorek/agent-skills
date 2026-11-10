# Rust metric rules

Rules version: **1.0** (`rules_version` in reports).

The [generic metric rules](generic-metric-rules.md) define shared scoring, ownership, and table notation. This document specifies Rust syntax mappings and exceptions.

Rust function syntax has the following mappings:

* `fn` items, `impl` methods, and closures are functions under the generic ownership rules.
* Macro invocations and definitions do not create function records.

## Cyclomatic Complexity

### Decisions

Rust decision syntax maps to the [generic decision rules](generic-metric-rules.md#base-and-decisions):

* `if` and `else if` are conditions; `loop`, `while`, and `for` are loops.
* `match` is a selection. Each arm is a branch, including `_` and arms with empty bodies.
* Alternative patterns separated by `|` belong to one arm.

Rust-specific decision increments and exclusions are defined below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Pattern condition | An if-let condition is one decision. | `if let Some(value) = item {}` | +1 |
| Pattern loop | A while-let loop is one decision. | `while let Some(value) = item {}` | +1 |
| Pattern binding | A pattern binding adds no separate decision. | `for (key, value) in pairs {}` | 0 additional |
| Match guard | A guard adds no decision of its own; scored constructs inside it still contribute. | `match value { x if x > 0 => work(), _ => {} }` | 0 additional |
| Propagation | The propagation operator adds no decision. | `load()?` | 0 |
| Macro invocation | A macro invocation adds no decision. | `println!()`<br>`vec![]`<br>`tokio::select! {}` | 0 |
| Macro definition | A macro definition adds no decision. | `macro_rules! answer { () => { 42 }; }` | 0 |

Macro token trees follow the [macro exclusion requirements](#macro-definitions-and-invocations).

Examples:

```rust
fn empty() {} // +1: outer base
// Cyclomatic: 1
```

```rust
fn choose(a: bool, b: bool) -> i32 { // +1: outer base
    if a && b {                    // +1: if; +1: &&
        return first();            // 0: return and call
    }
    second()                       // 0: call and implicit return
}
// Cyclomatic: 3
```

```rust
fn dispatch(kind: i32) { // +1: outer base
    match kind {        // 0: match itself
        1 => first(),   // +1: arm
        2 => {},        // +1: empty arm
        _ => second(),  // +1: wildcard arm
    }
}
// Cyclomatic: 4
```

### Reference totals

Complete scores for Rust-specific constructs are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Match total | An outer with three match arms | `fn f(x: i32) { match x { 1 => first(), 2 => second(), _ => third() } }` | 4 |
| Propagation total | An outer containing only a propagation expression | `fn f() { load()?; }` | 1 |
| Macro-only total | An outer containing only a macro invocation | `fn f() { work!(); }` | 1 |

## Cognitive Complexity

### Language constructs

The [Rust construct mappings](#decisions) identify loops and selections for the [generic Cognitive rules](generic-metric-rules.md#cognitive-complexity).

Labeled jumps use `break 'label` or `continue 'label`.

Rust-specific exclusions and reference totals are defined below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Propagation | The propagation operator adds no points. | `load()?` | 0 |
| Pattern binding | A pattern binding adds no points of its own. | `if let Some(value) = item {}` | 0 additional |
| Macro invocation | A macro invocation adds no points. | `println!()`<br>`vec![]`<br>`tokio::select! {}` | 0 |
| Macro definition | A macro definition adds no points. | `macro_rules! answer { () => { 42 }; }` | 0 |
| Simple-match total | A match with three simple calls | `fn f(x: i32) { match x { 1 => first(), 2 => second(), _ => third() } }` | 1 |
| Match-with-condition total | A match with an atomic-condition if in one arm | `fn f(x: i32) { match x { 1 => { if ready {} }, _ => {} } }` | 3 |
| Loop-with-condition total | A loop containing an atomic-condition if | `fn f() { loop { if ready {} } }` | 3 |
| Labeled-jump total | A labeled loop with an if and a labeled break | `fn f() { 'outer: loop { if ready { break 'outer; } } }` | 4 |

## Statement Count

### Tail values

A Rust tail expression is an implicit return under the [generic returned-value rules](generic-metric-rules.md#implicit-returns-and-selections).

Complete tail-expression scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Constant-tail total | A constant tail value | `fn f() -> i32 { 42 }` | 1 |
| Call-tail total | A call used as the tail value | `fn f() -> i32 { calculate() }` | 2 |

### Trailing selections in Rust

Trailing `if` and `match` expressions are value-producing selections under the generic returned-value rules.

Complete selection scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Constant-selection total | A trailing selection with two constant branch values | `fn f() -> i32 { if a { 1 } else { 2 } }` | 3 |
| Call-selection total | A trailing selection with one call in each branch | `fn f() -> i32 { if a { first() } else { second() } }` | 5 |

Examples:

```rust
fn choose(x: bool) -> i32 {
    if x {        // +1: if
        1         // +1: implicit return
    } else {      // 0
        2         // +1: implicit return
    }
}
// Statement Count: 3

fn choose_match(x: bool) -> i32 {
    match x {     // +1: match
        true => 1,  // +1: implicit return
        false => 2, // +1: implicit return
    }
}
// Statement Count: 3
```

### Conditional initializers in Rust

An `if` or `match` initializer is a value-producing selection inside a `let` declarator.

Complete initializer scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Constant-initializer total | A declarator initialized by an if with two constant branch values | `let x = if b { 1 } else { 2 };` | 4 |
| Constant-match-initializer total | A declarator initialized by a match with two constant branch values | `let x = match a { true => 1, false => 2 };` | 4 |
| Call-initializer total | A declarator initialized by a selection with one call in each branch | `let x = if a { first() } else { second() };` | 6 |

Examples:

```rust
fn example(b: bool) {
    let x =                 // +1: declarator
        if b {              // +1: if
            1               // +1: branch value
        } else {
            2               // +1: branch value
        };
}
// Statement Count: 4

fn example_match(b: bool) {
    let x =                 // +1: declarator
        match b {           // +1: match
            true => 1,      // +1: branch value
            false => 2,     // +1: branch value
        };
}
// Statement Count: 4
```

### Local functions and closures

Local `fn` items are named declarations; closures such as `|| {}` are function values under the [generic nested-function rules](generic-metric-rules.md#nested-functions).

Example:

```rust
fn outer() {
    fn inner() {}             // +1: nested function declaration
}
// Statements outer: 1
```

### Block values

Rust block expressions follow the [generic block rules](generic-metric-rules.md#code-blocks). Async blocks use the interpretation in [Rust async blocks](../../references/limitations.md#rust-async-blocks).

Complete block-expression scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Nested-block total | Three extra blocks around one final constant value | `fn f() -> i32 { { { { 1 } } } }` | 4 |
| Block-initializer total | A declarator initialized by a block containing two calls and a tail value | `let result = { prepare(); calculate() };` | 5 |

Examples:

```rust
fn example() -> i32 { // function body: 0
    {                // extra block: +1
        {            // extra block: +1
            {        // extra block: +1
                1    // implicit return: +1
            }
        }
    }
}
// Statement Count: 4

fn initializer() {
    let result = {   // declarator: +1; extra block: +1
        prepare();   // call: +1
        calculate()  // call and implicit return: +2
    };
}
// Statement Count: 5
```

### Pattern bindings in Rust

Patterns in `if let`, `while let`, and `for` headers are declarators under the [generic declarator rule](generic-metric-rules.md#calls-declarators-and-assignments).

Rust binding increments and complete fragment scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Pattern binding | Each header pattern contributes one declarator point. | `if let Some(value) = item {}` | +1 |
| Binding keyword | The let keyword adds no second point beyond the binding. | `if let Some(value) = item {}` | 0 additional |
| If-let fragment total | An if-let binding and one body call | `if let Some(value) = item { consume(value); }` | 3 |
| While-let fragment total | A while-let binding, one header call, and one body call | `while let Some(value) = next() { consume(value); }` | 4 |
| For fragment total | A for binding and one body call | `for value in values { consume(value); }` | 3 |
| Destructuring-for total | A shared pair binding and an empty body | `for (key, value) in pairs {}` | 2 |

The following syntax requirements govern these fragments:

* The iteration machinery implied by `for` syntax is implicit, not an explicit call.
* The example fragments are function bodies.

Examples:

```rust
if let Some(value) = item {       // +1: if; +1: binding
    consume(value);               // +1: call
}
// Statements: 3

while let Some(value) = next() {  // +1: loop; +1: binding; +1: call
    consume(value);               // +1: call
}
// Statements: 4

for value in values {            // +1: loop; +1: binding
    consume(value);               // +1: call
}
// Statements: 3

for (key, value) in pairs {}      // +1: loop; +1: shared binding
// Statements: 2
```

### Macro definitions and invocations

Rust macro increments and complete fragment scores are defined below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Macro invocation | Each invocation contributes one call point, regardless of delimiters or name. | `println!()`<br>`vec![]`<br>`tokio::select! {}` | +1 |
| Macro definition | Each definition inside an outer contributes one definition point, even when unused; it is not a call. | `fn f() { macro_rules! answer { () => { 42 }; } }` | +1 |
| Macro contents | Invocation and definition contents contribute no points to any metric. | `work!(if ready { call(); });` | 0 |
| Declaration-and-macro total | A declarator initialized by a macro invocation | `let x = vec![];` | 2 |
| Return-and-macro total | An explicit return containing a macro invocation | `return vec![];` | 2 |
| Definition-and-call total | One local definition and one invocation | `fn f() { macro_rules! answer { () => { 42 }; } answer!(); }` | 2 |

Macro exclusion requirements govern all three metrics:

* Macros are not expanded. Token trees are opaque, including blocks, calls, decisions, functions, closures, and semicolons written inside them.
* Excluding definition contents takes precedence over rules for the constructs inside them. Arms and template contents do not affect the definition's score.
* The parser's `macro_invocation` node represents an invocation; its `token_tree` contents are excluded.
* A macro alone does not make a metric `null`.

Example:

```rust
fn outer() {
    macro_rules! answer { // +1: definition; contents excluded
        () => { 42 };
    }
    answer!();            // +1: call; no expansion
}
// Statements: 2; Cognitive: 0; Cyclomatic: 1 (outer base)
```
