# Rust metric rules

Rules version: **2.0** (target scoring specification; implementation remains at 1.0).

The [generic metric rules](generic-metric-rules.md) define shared scoring, ownership, and table notation. This document specifies Rust syntax mappings and exceptions.

Apply the shared [recursive composition rules](generic-metric-rules.md#recursive-composition) to every recognized Rust construct. Syntax mappings apply in all expression positions and at arbitrary nesting depth. Examples do not limit supported combinations.

Rust function syntax has the following mappings:

* `fn` items, `impl` methods, and closures are functions under the generic ownership rules.
* An `async` block does not create a function boundary.
* Macro invocations and definitions do not create function records.
* Rust `cfg` attributes do not filter the source.

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

Macro arguments follow the [macro composition requirements](#macro-definitions-and-invocations). Zero points for the invocation itself do not exclude decisions in its arguments.

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

Macro invocations preserve the enclosing Cognitive depth. Analyze their arguments recursively, including decisions, logical sequences, and nested functions. Macro definition templates remain excluded as specified in the [macro rules](#macro-definitions-and-invocations).

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

A Rust tail expression supplies a result under the [generic returned-value rules](generic-metric-rules.md#implicit-returns-and-selections). In a function body, that result is an implicit function return. In a block or value-producing branch, it is a block or branch result. Forwarding the result through enclosing blocks or selections adds no duplicate result point.

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

Rust block expressions follow the [generic block rules](generic-metric-rules.md#code-blocks).

Complete block-expression scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Async block | An async block contributes an extra-block point. | `async { work() }` | +1 block point |
| Nested-block total | Three extra blocks around one final constant value | `fn f() -> i32 { { { { 1 } } } }` | 4 |
| Block-initializer total | A declarator initialized by a block containing two calls and a tail value | `let result = { prepare(); calculate() };` | 5 |
| Async-closure total | A closure declarator containing an async block with one returned call | `fn f() { let c = \|\| async { work() }; }` | 4 |

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

```rust
fn example_async() {
    let c = || async { // +1: declarator; +1: extra block
        work()         // +1: call; +1: implicit return
    };
}
// Statement Count: 4
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
| Macro arguments | Recognized argument operations contribute recursively under the ordinary rules for all three metrics. | `work!(load());` | Statements +1 for the contained call, in addition to the invocation |
| Definition template | Definition patterns and templates are excluded from all three metrics. | `macro_rules! answer { () => { 42 }; }` | 0 contents points |
| Declaration-and-macro total | A declarator initialized by a macro invocation | `let x = vec![];` | 2 |
| Return-and-macro total | An explicit return containing a macro invocation | `return vec![];` | 2 |
| Definition-and-call total | One local definition and one invocation | `fn f() { macro_rules! answer { () => { 42 }; } answer!(); }` | 2 |

Macro composition requirements govern all three metrics:

* Each invocation is a call operation. Its own contribution is Statements +1, Cognitive 0, and Cyclomatic 0.
* Analyze written argument expressions recursively. Include calls in receivers, chains, arguments, and nested macro invocations. No macro-specific scoring rule is needed for these combinations.
* Apply ordinary rules to other recognized argument constructs, including blocks, selections, logical expressions, and closures. Macro arguments have ordinary argument context, not implicit-return context.
* An invocation does not increase Cognitive depth. Separate arguments form separate logical sequences. Constructs inside each argument retain their own nesting and sequence rules.
* Do not expand macros or count operations generated by expansion. Count written argument operations once, even when expansion would duplicate, omit, or conditionally evaluate them.
* Definition patterns and templates remain excluded. They describe expansion syntax rather than invocation arguments. Count a local definition point without traversing that definition's contents.
* A parser `token_tree` is a representation boundary, not a scoring exclusion. The adapter must recover the argument structure and preserve original source locations before applying shared metric rules.

Argument recognition follows syntax, not an enumeration of macro names or call combinations:

* Empty contents have no argument operations. A complete Rust expression, or a complete comma-separated expression list with an optional trailing comma, supplies ordinary arguments.
* Recognize each whole argument recursively, including nested macros. Use parsed fragment boundaries rather than splitting text at every comma.
* Invocation delimiters, grouping parentheses, and argument separators add no operations. An actual block expression inside the argument list follows the ordinary block rules. All invocation delimiter forms follow the same principle.
* Other macro input grammars require a syntax mapping to ordinary operations and child roles. For example, a repetition form can map its value and count expressions as children. Such a mapping defines structure, not a separate metric formula.
* Do not infer calls by searching token text for identifiers followed by parentheses. Patterns, quoted templates, and custom macro languages can resemble executable expressions.
* When the input cannot be classified completely, apply the shared coverage rules. Preserve the known invocation contribution for explanation, but do not publish a partial sum as a complete metric.

A recognized macro invocation alone does not make a metric unavailable. Unsupported argument syntax can make affected metrics unavailable; it must not silently contribute zero.

Derived examples demonstrate composition rather than additional rules:

```rust
fn check(value: f64) {
    assert_eq!(TrueAirspeed::new(value).unwrap().knots(), value);
    // Statements: +4 = macro + new + unwrap + knots
}
// Statements: 4; Cognitive: 0; Cyclomatic: 1 (outer base)

fn nested() {
    outer!(inner!(load()));
    // Statements: +3 = outer macro + inner macro + load
}
// Statements: 3; Cognitive: 0; Cyclomatic: 1 (outer base)

fn condition(ready: bool) {
    assert!(ready && verify());
    // Statements: +2 = macro + verify; Cognitive: +1 and Cyclomatic: +1 for &&
}
// Statements: 2; Cognitive: 1; Cyclomatic: 2 (including outer base)
```

These are syntax-scoring examples; macro definitions and type checking are not required for the illustrated argument forms.

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
