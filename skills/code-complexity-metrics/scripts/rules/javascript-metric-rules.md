# JavaScript metric rules

Rules version: **2.1**.

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

## Halstead Volume

Use the [shared Halstead rules](generic-metric-rules.md#halstead-volume) and classify the following JavaScript syntax by its AST role.

| Construct | Classification |
| --- | --- |
| Declarations and patterns | Count `let`, `const`, `var`, and `using`. Count `=` once for an initializer or default. Visit binding identifiers and written property keys. Count rest and spread as distinct operators. Pattern delimiters and key separators add no occurrences. |
| Calls and access | Count `call` for ordinary calls and tagged templates, `member_access` for property access, and `index` for bracket access. Use `new` and `import` for constructor expressions and dynamic imports. Each written `?.` adds `optional_chain` in addition to the operation it guards. |
| Operators and control flow | Count written arithmetic, comparison, logical, assignment, update, and other operators recognized by the parser. Separate unary sign operators from binary addition and subtraction. A ternary expression contributes one `conditional` operator. |
| Nested functions | Count the function declaration or arrow operator and visit its header and body. Count a written `async` and a generator's declaration marker. The outer's own header is excluded. |
| Identifiers and literals | Count identifiers and labels. Count each number, Boolean, `null`, string, and regular expression as an operand with its exact spelling. |
| Templates | A template without substitutions is one operand. An interpolated template contributes one `template_literal` operator, one operand for each nonempty text chunk between substitutions, and the ordinary contributions of each substitution expression. Keep escape spellings in their containing chunk. |

For `const total = price + 2; return send(total);`, the five operators are `const`, `=`, `+`, `return`, and `call`. The five operands contain four distinct keys because `total` appears twice. The resulting Volume is `10 × log₂(9)`, about 31.70.
