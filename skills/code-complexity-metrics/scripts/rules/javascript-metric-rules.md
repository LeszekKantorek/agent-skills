# JavaScript metric rules

Rules version: **2.0**.

The [generic metric rules](generic-metric-rules.md) define shared scoring, ownership, and table notation. This document specifies JavaScript syntax mappings and exceptions.

Apply the shared [recursive composition rules](generic-metric-rules.md#recursive-composition) at arbitrary nesting depth. These mappings classify syntax wherever it occurs; examples do not define a whitelist of combinations.

The JavaScript analyzer builds Analyze AST from the JavaScript parser tree, preserving node types, child roles, relevant tokens, and original source locations. Separate recursive passes assign local Cognitive, Cyclomatic, and Statements contributions to their respective `score` fields under the shared [analysis contract](generic-metric-rules.md#analysis-structure-and-responsibilities).

The JavaScript analyzer determines function ownership and records diagnostics. Shared aggregation sums the assigned scores without interpreting JavaScript syntax.

Calls and constructor calls include their receivers, computed targets, and argument expressions. Apply ordinary rules recursively to those children, including nested calls, selections, and function values. A call contributes no Cognitive depth. Nested functions establish their own depth and result contexts under the shared rules.

Function declarations, function expressions, methods, and arrow functions are functions under the generic ownership rules.

## Cyclomatic Complexity

### Decisions

JavaScript syntax maps to the [generic decision rules](generic-metric-rules.md#base-and-decisions):

* `if` and `else if` are conditions; `?:` is a conditional expression.
* `for`, `for-in`, `for-of`, `while`, and `do-while` are loops.
* `switch` is a selection. Each `case` or `default` label introduces a branch, including labels with empty bodies.
* `catch` is an exception handler.

JavaScript-specific decision increments and exclusions are defined below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Nullish coalescing | Each nullish coalescing operator contributes one decision. | `a ?? b` | +1 |
| Optional chaining | Optional chaining adds no decision. | `value?.field` | 0 |
| Logical assignment | Logical assignments add no decision of their own. | `a &&= b; a \|\|= b; a ??= b;` | 0 |

Logical-expression nodes determine decisions; tokens inside other constructs do not represent logical expressions.

Examples:

```javascript
function empty() {} // +1: outer base
// Cyclomatic: 1
```

```javascript
function choose(a, b, value) { // +1: outer base
    if (a && b) {            // +1: if; +1: &&
        return first();      // 0: return and call
    }
    return value ?? fallback(); // +1: ??; 0: return and call
}
// Cyclomatic: 4
```

```javascript
function dispatch(kind) { // +1: outer base
    switch (kind) {      // 0: switch itself
        case 'first':    // +1: branch
            first();
            break;
        default:         // +1: default branch
            second();
    }
}
// Cyclomatic: 3
```

### Reference totals and ownership example

Complete scores for JavaScript-specific syntax are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Switch total | An outer with two case branches and one default | `function f(x) { switch (x) { case 1: break; case 2: break; default: break; } }` | 4 |
| Nullish-return total | An outer returning a nullish coalescing expression | `function f(a, b) { return a ?? b; }` | 2 |
| Optional-access total | An outer returning an optional property access | `function f(a) { return a?.b; }` | 1 |

The generic ownership rules produce records only for `process`, `calculate`, and `refresh` in this example:

```javascript
function process() {              // outer: separate result
    function validate() {         // nested function: part of process
        function check() {}       // another level: still part of process
    }

    const save = () => {};        // nested closure: part of process
    validate();                   // call; do not count the validate body again
}

function calculate() {}           // separate outer
const refresh = () => {};         // arrow outside another function: separate result
```

## Cognitive Complexity

### Language constructs

The [JavaScript construct mappings](#decisions) identify the categories used by the [generic Cognitive rules](generic-metric-rules.md#cognitive-complexity).

Labeled jumps use `break label` or `continue label`.

JavaScript-specific exclusions and reference totals are defined below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Try and finally | Try and finally add no points and do not increase nesting depth. | `try {} finally {}` | 0 |
| Optional chaining | Optional chaining adds no points. | `value?.field` | 0 |
| Nullish coalescing | Nullish coalescing is outside logical AND/OR sequences. | `a ?? b` | 0 |
| Condition-header total | An if whose condition contains a ternary | `function f(a, b, c) { if (a ? b : c) {} }` | 2 |
| Condition-body total | An if whose body contains a ternary in a call | `function f(a, b, c) { if (a) { use(b ? c : a); } }` | 3 |

Examples:

```javascript
function condition(a, b, c) {
    if (a ? b : c) {}    // +1: if; +1: ternary in the condition at the same depth
}
// Cognitive: 2

function body(a, b, c) {
    if (a) {            // +1: if
        use(b ? c : a); // +2: ternary in the if body; the use call adds 0
    }
}
// Cognitive: 3
```

## Statement Count

### Declarators and implicit returns

JavaScript syntax maps to the [generic declarator](generic-metric-rules.md#calls-declarators-and-assignments) and [returned-value rules](generic-metric-rules.md#implicit-returns-and-selections):

* `var`, `let`, and `const` declarations contain declarators; destructuring forms a shared pattern.
* Bindings declared with `var`, `let`, or `const` in `for-in` and `for-of` headers are declarators.
* Each class field is a declarator, including fields without initializers. Static and private modifiers add no points. Analyze the field name and initializer in their respective contexts. Operations in the initializer do not suppress an expression-statement wrapper around the class expression.
* An assignment to an existing field, a method, and an object literal property are distinct from a field declarator.
* An expression-bodied arrow's result is an implicit return. A conditional arrow body is a value-producing selection.

Complete scores for these forms are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Constant-arrow total | An expression-bodied arrow returning a constant | `() => 42` | 1 |
| Call-arrow total | An expression-bodied arrow returning one call | `() => calculate()` | 2 |
| Multiple-declarator total | Two declarators in one declaration | `let a = 1, b = 2;` | 2 |
| For-binding total | A for-of loop with one binding and one body call | `for (const value of values) { consume(value); }` | 3 |

### Conditional operator in JavaScript

The ternary operator `?:` is a value-producing selection under the generic returned-value rules.

Each result branch supplies a branch-result point, independently of contained calls. A nested selection delegates result scoring to its branches. An enclosing expression-bodied arrow does not add another implicit-return point for the same selection result. These rules also apply when a ternary occurs in an argument, condition, assignment, or larger expression.

Complete initializer scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Constant initializer total | A declarator initialized by a ternary with two constant branch values | `const x = b ? 1 : 2;` | 4 |
| Call initializer total | A declarator initialized by a ternary with one call in each branch | `const x = b ? first() : second();` | 6 |

Examples:

```javascript
function example(b) {
    const x = b ? 1 : 2;
    // +1: declarator; +1: ?:; +1: first branch value; +1: second branch value
}
// Statement Count: 4

function example_calls(b) {
    const x = b ? first() : second();
    // +1: declarator; +1: ?:; +2: branch values; +2: calls
}
// Statement Count: 6
```

### Function declarations and values

Standalone `function` declarations and function expressions map to distinct [generic nested-function rules](generic-metric-rules.md#nested-functions). Arrow functions are function values.

A named expression, such as `const f = function named() {};`, remains a function value.

The following total illustrates declarators initialized by function values:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Three-declarator total | Three variables initialized by function values | `const a = () => {}; const b = function() {}; const c = function named() {};` | 3 |

Examples:

```javascript
function outer() {
    function inner() {}       // +1: nested function declaration
}
// Statements outer: 1

function with_arrow() {
    const inner = () => {};   // +1: declarator; no extra point for the arrow
}
// Statements with_arrow: 1
```

```javascript
function outer() {
    const a = () => {};                // +1: declarator
    const b = function() {};           // +1: declarator
    const c = function named() {};     // +1: declarator; no extra point for the name
}
// Statements outer: 3
```

### Code blocks

JavaScript block statements follow the [generic block rules](generic-metric-rules.md#code-blocks). Object literals, imports, and destructuring patterns are not block statements.

The following total illustrates a nested block statement:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Block-and-call total | An extra block containing one call | `function f() { { work(); } }` | 2 |

Example:

```javascript
function example() { // function body: 0
    {                // extra block: +1
        work();      // call: +1
    }
}
// Statement Count: 2
```

### Branches and exception handling

JavaScript statement syntax maps to the [generic control-statement](generic-metric-rules.md#calls-declarators-and-assignments) and [branch-label rules](generic-metric-rules.md#implicit-returns-and-selections):

* An `else if` contains another `if` control statement; an `else` is a branch marker.
* `switch` and `catch` are control constructs; `case` and `default` are branch labels.

Complete fragment scores are shown below:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| If-chain total | Two if conditions and three branch calls | `if (a) { first(); } else if (b) { second(); } else { third(); }` | 5 |
| Switch total | A switch, two calls, and one break | `switch (x) { case 1: first(); break; default: second(); }` | 4 |
| Catch-fragment total | A catch clause containing one call | `catch (error) { recover(); }` | 2 |

The catch-fragment total is a contribution within a valid try/catch, not a whole-function score.

Examples:

```javascript
function branches(a, b) {
    if (a) {          // +1: if
        first();      // +1: call
    } else if (b) {   // +1: if
        second();     // +1: call
    } else {          // 0: branch label
        third();      // +1: call
    }
}
// Statements: 5

function choice(x) {
    switch (x) {      // +1: switch
        case 1:       // 0: label
            first();  // +1: call
            break;    // +1: control statement
        default:      // 0: label
            second(); // +1: call
    }
}
// Statements: 4
```

### Updates and constructors

JavaScript adds update expressions and maps `new` expressions to explicit calls:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Update | Each update expression contributes one point. | `x++`<br>`++x`<br>`x--`<br>`--x` | +1 |
| Constructor | Each new expression is one explicit constructor call. | `new Foo()` | +1 call point |
| Update total | One prefix or postfix update | `x++;`<br>`++x;` | 1 |
| Constructor total | One explicit constructor call | `new Foo();` | 1 |
| Constructor-initializer total | A declarator initialized by a constructor with a nested argument call | `let x = new Foo(load());` | 3 |

### Delegated suspension, environment and debugging mappings

`yield` and `yield*` each write one explicit suspension and contribute Statements 1 on `yield_expression`; `*` adds no second operation. `with` establishes a name-resolution environment and contributes Statements 1 on `with_statement`; its body is a direct body. `debugger` is an explicit debugger command and contributes Statements 1 on `debugger_statement`. Each has Cognitive 0 and Cyclomatic 0 of its own; visit all children under their ordinary contexts. These delegated decisions extend the earlier profile and do not depend on runtime execution or debugger availability.
