# JavaScript metric rules

Rules version: **2.0**.

The [generic metric rules](generic-metric-rules.md) define shared scoring, ownership, and table notation. This document specifies JavaScript syntax mappings and exceptions.

Apply the shared [recursive composition rules](generic-metric-rules.md#recursive-composition) at arbitrary nesting depth. These mappings classify syntax wherever it occurs; examples do not define a whitelist of combinations.

The JavaScript analyzer builds Analyze AST from the parser tree, preserving node types, child roles, relevant tokens, and original source locations. The Cognitive pass records local contributions in `score.cognitive`. [Shared analysis contract](generic-metric-rules.md#analysis-structure-and-responsibilities)

The JavaScript analyzer determines function ownership and records diagnostics. Shared aggregation sums the assigned scores without interpreting JavaScript syntax.

Calls and constructor calls include their receivers, computed targets, and argument expressions. Apply ordinary rules recursively to those children, including nested calls, selections, and function values. A call contributes no Cognitive depth. Nested functions increase depth under the shared rules.

Function declarations, function expressions, methods, and arrow functions are functions under the generic ownership rules.

## Function ownership

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

Apply the [generic Cognitive rules](generic-metric-rules.md#cognitive-complexity) to these JavaScript constructs.

* `if` and `else if` are conditions. `?:` is a conditional expression.
* `for`, `for-in`, `for-of`, `while`, and `do-while` are loops.
* `switch` is a selection. `case` and `default` are branch labels.
* `catch` is an exception handler.

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

### Suspension, temporary name environments, and debugging

`yield`, `yield*`, `with`, and `debugger` add no Cognitive points or depth of their own. Visit their children under the ordinary rules.
