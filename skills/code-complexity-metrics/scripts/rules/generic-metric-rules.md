# Generic metric rules

Rules version: **1.0** (`rules_version` in reports).

The shared rules and the relevant language document form one scoring profile:

* [Rust metric rules](rust-metric-rules.md).
* [JavaScript metric rules](javascript-metric-rules.md).

The complete scoring profile has the following requirements:

* This profile defines scoring and test expectations. Gaps must be resolved before affected constructs are implemented.
* Rules are versioned independently of the parser. Parser updates do not change the scoring rules.
* An **outer** is a function without an enclosing function. Only outers receive report records and contribute to reported function counts.
* Module-level functions, methods, anonymous functions, and closures outside another function can be outers. Visibility and exports do not determine ownership.
* A **nested function** is defined inside another function. Its code belongs to its enclosing outer, including through several nesting levels.
* Nested methods follow the same ownership rule. Internal locations do not create separate or duplicate results.
* Each written construct contributes once, regardless of reachability or execution count. Nested bodies contribute even when uncalled.
* Equivalent constructs and control-flow structures have the same scores across languages. This requirement also governs future adapters.
* Syntax without an equivalent does not require an artificial counterpart. Arbitrary semantically equivalent programs need not have the same scores.
* A valid metric is a nonnegative integer. An unavailable metric is represented only by `null`, without a reason or metric status.
* The three metrics are independent; points in one metric do not change either of the others.
* Reference totals are expectations derived from the rules, not a test execution report.

Table examples use pseudocode; `outer`, `select`, and `closure` denote language-independent constructs. Points describe only the named construct unless the rule specifies a total. Language documents map syntax to these rules and define exceptions.

## Cyclomatic Complexity

### Base and decisions

Decision increments:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Outer base | Each reported outer has one base point, including an empty outer. | `outer f {}` | 1 base |
| Nested-function base | A nested function or closure has no additional base point. | `outer f { function inner() {} }` | 0 additional |
| Condition | Each if or else-if condition contributes one decision. | `if a {} else if b {}` | +1 per condition |
| Loop | Each loop contributes one decision. | `while condition {}` | +1 |
| Conditional expression | Each conditional expression contributes one decision. | `condition ? first : second` | +1 |
| Selection branch | Each selection branch contributes one decision, including default branches and empty bodies. | `select value { default => {} }` | +1 per branch |
| Selection construct | The selection construct adds no decision beyond its branches. | `select value { default => work(); }` | 0 additional |
| Else and ordinary jumps | Else, return, break, continue, and throw add no decisions. | `return value;` | 0 |
| Exception handler | An exception handler adds no decision. | `catch error { recover(); }` | 0 |
| Ordinary call | An ordinary call adds no points. | `work()` | 0 |
| Braces and nesting | Braces and nesting depth add no points. | `{ { work(); } }` | 0 |
| Logical operator | Each logical operator contributes separately. | `a && b; a \|\| b` | +1 |

Decision collection follows these requirements:

* Decisions in arguments, initializers, returned expressions, and other subexpressions contribute to the result.
* Empty bodies do not exclude functions or branches from measurement.
* Language mappings identify syntax for these decisions and any additional or excluded constructs.

### Reference totals

Complete scores for equivalent control-flow structures:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Empty outer total | Empty function | `outer f {}` | 1 |
| Call-only outer total | One simple call, no decisions | `outer f { work(); }` | 1 |
| Single-condition total | Function-level if with an else | `outer f { if a {} else {} }` | 2 |
| Condition-chain total | Function-level if, else-if, and else | `outer f { if a {} else if b {} else {} }` | 3 |
| Flat-condition total | Three flat if statements | `outer f { if a {} if b {} if c {} }` | 4 |
| Nested-condition total | Three nested if statements | `outer f { if a { if b { if c {} } } }` | 4 |
| Nested-closure total | If in outer, then a closure with two nested if statements | `outer f { if a { let g = closure { if b { if c {} } }; } }` | 4 |

## Cognitive Complexity

### Conditions and nested functions

Declaration and condition increments:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Outer base | Each outer starts at zero. | `outer f {}` | 0 |
| Function declaration | A function declaration adds no points. | `outer f { function inner() {} }` | 0 |
| Condition | An if adds its structural point and current depth. | `if condition` | +1 + depth |
| Else-if | An else-if adds no nesting cost for the chain itself. | `else if condition` | +1 |
| Else | An ordinary else adds no nesting cost for the else itself. | `else` | +1 |
| Recursion | Recursion adds no points. | `outer f { f(); }` | 0 additional |

Nesting depth follows these requirements:

* Entering a nested function or closure preserves the current depth and increases it by 1.
* Scored constructs inside the nested function use that depth. The previous depth resumes outside the function.
* The profile remains syntactic.

### Loops, selections, and jumps

Construct increments, where supported by the language:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Loop | Each loop contributes once. | `while condition { work(); }` | +1 + depth |
| Selection | Each entire selection contributes once. | `select value { 1 => first(); default => second(); }` | +1 + depth |
| Exception handler | Each exception handler contributes once. | `catch error { recover(); }` | +1 + depth |
| Conditional expression | Each conditional expression contributes once. | `condition ? first : second` | +1 + depth |
| Branch label | Branch labels add no points. | `default => work();` | 0 |
| Labeled jump | Labeled jumps have no nesting cost. | `break label;` | +1 |
| Ordinary jump | Ordinary jumps add no points. | `return value;` | 0 |
| Ordinary call | Ordinary calls add no points. | `first()` | 0 |
| Extra block | Extra blocks add no points. | `{ work(); }` | 0 |

Nesting follows these requirements:

* Depth starts at 0 in an outer body and increases by 1 inside condition branches, loop bodies, selection branches, and exception-handler bodies.
* Both result branches of a conditional expression also increase depth by 1.
* An extra block alone does not increase depth.
* The previous depth resumes outside a construct. Scored contents of an otherwise unscored construct still contribute.
* Conditions retain their current depth. The body's extra level does not extend to its header.
* The header rule covers initializers, conditions, updates, selection subjects, and conditional-expression conditions.
* Nested constructs in headers retain their own depth rules. Decisions in conditions remain part of the measurement.

### Logical sequences

Logical-sequence increments without nesting cost:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Logical sequence | The first AND/OR sequence in an expression contributes an increment. | `a && b` | +1 |
| Operator | Each change of operator contributes an increment. | `a && b \|\| c` | +1 per change |
| Operator | Repeating the same operator adds no further points. | `a && b && c` | 0 additional |
| Grouping parentheses | Grouping parentheses neither add points nor break a sequence. | `(a && b)` | 0 |
| Repeated-AND total | A sequence of three AND operands | `a && b && c` | 1 |
| Repeated-OR total | A sequence of three OR operands | `a \|\| b \|\| c` | 1 |
| One-change total | A logical sequence with one operator change | `a && b \|\| c` | 2 |
| Two-change total | A logical sequence with two operator changes | `a \|\| b && c \|\| d` | 3 |
| Two-change total | A logical sequence with two operator changes | `a && b \|\| c && d` | 3 |
| Separate negated subexpression total | An AND sequence containing a separate negated AND expression | `a && !(b && c)` | 2 |

Sequence-boundary requirements:

* Separate arguments, statements, and function bodies form separate sequences. Nested-body points still belong to the outer.
* Negation around a logical expression creates a separate subexpression. Sequences remain separate across that boundary.

### Reference totals

Complete Cognitive scores:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Empty outer total | Empty function | `outer f {}` | 0 |
| Call-only outer total | One simple call, no decisions | `outer f { work(); }` | 0 |
| Single-condition total | Function-level if with simple calls in if and else branches | `outer f { if a { first(); } else { second(); } }` | 2 |
| Condition-chain total | Function-level if, else-if, and else with simple calls | `outer f { if a { first(); } else if b { second(); } else { third(); } }` | 3 |
| Flat-condition total | Three flat if statements | `outer f { if a {} if b {} if c {} }` | 3 |
| Nested-condition total | Three nested if statements | `outer f { if a { if b { if c {} } } }` | 6 |
| Simple-selection total | Selection with three simple branch calls | `outer f { select value { 1 => first(); 2 => second(); default => third(); } }` | 1 |
| Selection-with-condition total | Selection containing an atomic-condition if in one branch | `outer f { select value { 1 => { if a {} } default => {} } }` | 3 |
| Loop-with-condition total | Loop containing an atomic-condition if | `outer f { while a { if b {} } }` | 3 |
| Labeled-jump total | The same loop and if plus a labeled break | `outer f { label: while a { if b { break label; } } }` | 4 |
| Nested-closure total | If in outer, then a closure with two nested if statements | `outer f { if a { let g = closure { if b { if c {} } }; } }` | 8 |

## Statement Count

### Calls, declarators, and assignments

Explicit-operation increments:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Explicit call | Each explicit function or method call contributes an increment. | `save()` | +1 per call |
| Declarator | Each declarator contributes an increment. | `let x = value;` | +1 |
| Declarator | Shared-initializer destructuring is one declarator. | `let (a, b) = pair;` | +1 |
| Assignment | Each assignment or compound assignment contributes an increment. | `x = 3;`<br>`x += 1;` | +1 |
| Control statement | Each control statement contributes an increment. | `if condition {}` | +1 |
| Explicit return | Each explicit return contributes one point. | `return value;` | +1 |
| Implicit call | Operator implementations and implicit iteration machinery do not create explicit call points. | `a + b` | 0 call points |

Collection requirements:

* Calls contribute regardless of their origin or whether the target is known.
* Calls in arguments, conditions, initializers, returned expressions, and chains contribute to the result.
* Assignments, control statements, declarators, and returns count separately from contained calls.
* Call targets are not resolved. A call does not add the target body's operations to the caller's score.

### Implicit returns and selections

Returned-value and selection increments:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Implicit return | Each implicit return contributes one point. | `outer f { value }` | +1 |
| Selection | A value-producing selection contributes an increment. | `if condition { first() } else { second() }` | +1 |
| Implicit return | Each branch's implicit return contributes separately from contained calls. | `if condition { value } else { other }` | +1 per branch value |
| Branch label | Branch labels add no points. | `else {}` | 0 |
| Selection | The whole selection result adds no second implicit return. | `outer f { if a { 1 } else { 2 } }` | 0 additional |
| Selection | Passing the selection result into its declarator adds no further point. | `let x = if a { 1 } else { 2 };` | 0 additional |
| Explicit return | An explicit return replaces the implicit return at the same position. | `if a { return value; }` | 0 implicit-return points |

Selection-value requirements:

* Every written branch contributes, regardless of which branch executes.
* The same rules govern nested selections recursively. A complete selection is not another returned value.
* The enclosing declarator contributes separately when the selection initializes a variable.
* Applicable syntax and examples are defined by the [Rust selection rules](rust-metric-rules.md#trailing-selections-in-rust) and [JavaScript conditional rule](javascript-metric-rules.md#conditional-operator-in-javascript).

### Nested functions

Nested-definition increments:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Nested function | A standalone named nested declaration counts even when empty. | `outer f { function inner() {} }` | +1 |
| Function definition | The outer's own definition adds no point. | `outer f {}` | 0 |
| Declarator | A function used as a declarator value adds no definition point. | `let f = closure {};` | 0 definition points |

Ownership requirements:

* The declaration rule governs every nesting level.
* Standalone declarations and named function expressions assigned to variables are distinct constructs.
* The declarator remains subject to its own rule.

### Code blocks

Syntax-block increments:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Extra block | Each extra code block contributes an increment, even when empty. | `{ work(); }` | +1 |
| Direct body block | A direct function, closure, or control-construct body adds no block point. | `outer f { work(); }` | 0 block points |
| Extra block | A block within a direct body is extra. | `outer f { { work(); } }` | +1 |
| Block initializer | A block used as a variable initializer is extra. | `let x = { prepare(); value };` | +1 |
| Non-block braces | Non-block braces do not count as code blocks. | `let object = { key: value };` | 0 block points |
| Implicit return | Enclosing blocks do not repeat the same implicit return. | `outer f { { { value } } }` | 0 additional return points |
| Implicit return | A block without a final value has no implicit return point. | `{ work(); }` | 0 return points |

Block requirements:

* Block classification follows syntax rather than brace characters.
* Statements and calls inside blocks contribute separately from block points.

### Expression statements and separators

Standalone-statement increments:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Expression statement | A standalone expression statement counts once. | `x;`<br>`42;`<br>`x + 1;` | +1 each |
| Expression wrapper | Calls, assignments, or updates already counted do not need a wrapper point. | `save();` | 0 additional |
| Operand | Individual operands and subexpressions add no separate points. | `a + b` | 0 additional |
| Empty statement | Each standalone empty statement contributes an increment. | `;` | +1 |
| Empty statement | A terminator or separator is not another empty statement. | `for (; condition; update) {}` | 0 additional |
| Empty statement | Text semicolons are not empty statements. | `";"` | 0 |

Interpretation requirements:

* Empty-statement classification follows the parser rather than individual semicolon tokens.
* Statement Count is the project convention defined here. It does not simply count nodes named `statement`.

### Reference totals

Complete Statement Count scores:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Empty outer total | Empty function | `outer f {}` | 0 |
| Call total | One explicit call | `save();` | 1 |
| Call-and-empty-statement total | One call followed by an empty statement | `save();;` | 2 |
| Empty-statement total | Two empty statements | `;;` | 2 |
| Assignment total | One assignment without calls | `x = 3;` | 1 |
| Compound-assignment total | One compound assignment without calls | `x += 1;` | 1 |
| Assignment-and-call total | A compound assignment containing one call | `x += calculate();` | 2 |
| Chained-call total | Two chained calls | `value.trim().toLowerCase();` | 2 |
| Nested-call total | One call nested in another call | `outer(inner());` | 2 |
| Declarator total | Two declarators without calls | `let a = 1; let b = 2;` | 2 |
| Declaration-and-call total | One declarator initialized by one call | `let x = load();` | 2 |
| Declaration-and-chain total | One declarator initialized by two chained calls | `let x = a().b();` | 3 |
| Return-and-call total | An explicit return containing one call | `return save();` | 2 |
| Return total | An explicit return of a constant | `return 42;` | 1 |
| Implicit constant-return total | Implicit return of a constant value | `outer f { 42 }` | 1 |
| Implicit call-return total | Implicit return of `calculate()` | `outer f { calculate() }` | 2 |
| If-and-calls total | If with `check()` as its condition and `save()` in its body | `if check() { save(); }` | 3 |
| Empty extra-block total | Outer containing one extra empty block | `outer f { {} }` | 1 |
| Constant-selection total | Selection with two constant branch values | `if a { 1 } else { 2 }` | 3 |
| Constant-selection initializer total | Declarator initialized by that selection | `let x = if a { 1 } else { 2 };` | 4 |
