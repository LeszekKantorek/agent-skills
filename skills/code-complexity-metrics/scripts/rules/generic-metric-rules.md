# Generic metric rules

Rules version: **2.0**.

The shared rules and the relevant language document form one scoring profile:

* [Rust metric rules](rust-metric-rules.md).
* [JavaScript metric rules](javascript-metric-rules.md).

The complete scoring profile has the following requirements:

* This profile defines scoring and test expectations. Derive combinations of recognized constructs using the recursive composition rules below.
* Measurements use written syntax, without resolving types or counting executed paths.
* Rules are versioned independently of the parser. Parser updates do not change the scoring rules.
* An **outer** is a function without an enclosing function. Only outers receive report records and contribute to reported function counts.
* Module-level functions, methods, anonymous functions, and closures outside another function can be outers. Visibility and exports do not determine ownership.
* A **nested function** is defined inside another function. Its code belongs to its enclosing outer, including through several nesting levels.
* Nested methods follow the same ownership rule. Internal locations do not create separate or duplicate results.
* Each scored operation contributes once per metric, regardless of reachability or execution count. One syntax construct can contain several operations. Nested bodies contribute even when uncalled.
* Equivalent constructs and control-flow structures have the same scores across languages. Each language analyzer applies this requirement to its syntax.
* Syntax without an equivalent does not require an artificial counterpart. Arbitrary semantically equivalent programs need not have the same scores.
* A complete metric is a nonnegative integer. A result with an error is the known sum after excluding all contributions on affected physical lines; it is not a complete metric.
* The three metrics are independent; points in one metric do not change either of the others.
* Reference totals are expectations derived from the rules, not a test execution report.

Table examples use pseudocode; `outer`, `select`, and `closure` denote language-independent constructs. Points describe only the named construct unless the rule specifies a total. Language documents map syntax to these rules and define exceptions.

## Recursive composition

An operation is a scored action or structural boundary. The term describes the meaning of a rule, not a required node type. The language analyzer applies these rules directly to Analyze AST nodes, using their syntax, child roles, and metric context.

### Analysis structure and responsibilities

Tree-sitter parses the source with the language grammar. A registry selects the language analyzer once per file. That analyzer owns tree preparation and all three metric passes:

1. Build Analyze AST, preserving parser node types, child fields, child order, relevant tokens, and original source locations.
2. Complete syntax that requires additional parsing, such as Rust macro arguments. Finish the structure before scoring.
3. Traverse recursively for Cognitive Complexity, writing only `score.cognitive`.
4. Traverse recursively for Cyclomatic Complexity, writing only `score.cyclomatic`.
5. Traverse recursively for Statement Count, writing only `score.statements`.

Each node starts with `score: { cognitive: 0, cyclomatic: 0, statements: 0 }`. This field contains only that node's local contributions. A node can represent several scored actions; a single action represented by multiple parser nodes contributes only once.

The three passes use their own contexts and leave the prepared tree structure intact. Cognitive carries nesting depth and logical-sequence state. Statements tracks result positions, block roles, and expression boundaries. Cyclomatic identifies decisions and assigns the outer base exactly once, without additional bases for nested functions.

Rust and JavaScript implement these passes within their respective analyzers. Shared rules define score meanings; they do not require a shared scoring algorithm or a normalized operation tree. Shared helpers or abstractions serve only mechanisms that are identical across languages. Scoring code does not dispatch through `if rust / else javascript` branches.

The analyzer returns the tree, reported functions, node ownership, and diagnostics. Ownership and diagnostics are stored separately from tree nodes. Nodes retain parser locations for reports and `--explain`, without a duplicate `sourceRange`. They store no `subtreeScore`, `analyzed`, or `ownScore` fields.

Aggregation recursively sums local `score` values according to node ownership. It does not interpret syntax, add another Cyclomatic base, or store subtree totals in the tree. JSON, CSV, Markdown, and `--explain` use these contributions and the original source locations.

Source indices and columns count UTF-16 code units. Internal rows and columns are zero-based; range ends are exclusive. Reports use one-based rows and columns. A tab occupies one code unit, and a character outside the BMP occupies two. CRLF occupies two index units and ends one row.

The analyzer assigns a construct's contribution to the node identified by its scoring rule. Operator contributions belong to operator tokens, the Cyclomatic base to the outer node, and implicit-result contributions to result expressions. The same contribution is never assigned to both a node and its descendant.

`--explain` places each node's local score on its original start row. Contributions with the same outer and start row are added together. A multiline call chain can therefore place several call points on the row where the receiver begins. Do not move call points to method identifiers for presentation. Aggregators and renderers use the assigned nodes and locations without interpreting syntax or relocating contributions. Recovered macro arguments follow the same convention after mapping their positions to the original source.

### Apply rules to arbitrary nesting

1. Interpret each recognized node using its type, parent, child field, and context. Preserve roles such as condition, body, argument, receiver, initializer, and branch result.
2. Determine the node's local contribution in the relevant metric pass. A contribution of zero does not suppress its children.
3. Visit every included child recursively, using the context defined for that role. Apply the same rules at every nesting level.
4. After scoring, aggregate contributions into the owning outer. The Cyclomatic pass has already assigned the outer base exactly once.
5. Produce totals and source explanations from the same contributions. Formatting or flattening the structure must not change the score.

Recursive aggregation adds each node's local contribution and then visits its children. Context determines local contributions during scoring, before aggregation. Cognitive sequence points follow the logical-sequence rules rather than adding one point for every logical-expression node.

Context is scoped to the relevant child. Restore the enclosing context after visiting that child. Calls do not increase Cognitive depth or interrupt traversal of their receivers and arguments.

Count operations rather than parser wrappers. A returned call contains a call operation and a return operation. Parentheses, expression wrappers, or multiple syntax nodes representing one operation do not duplicate its contribution.

Nested function bodies contribute through their written definitions. A call never traverses the target function's body. Apply ownership and nesting rules even when a function appears inside an argument or initializer.

### Resolve overlap and genuine gaps

* Apply the shared rule after mapping language syntax. A language exception overrides only the contribution or traversal boundary it explicitly names.
* A rule assigning zero to a construct changes its own contribution only. Excluding descendants requires an explicit exclusion rule.
* Combine distinct operations. Apply replacement rules, such as expression-wrapper suppression or explicit-return replacement, only within their stated context.
* A new arrangement of recognized operations is not a specification gap. Derive its score without requesting a combination-specific rule.
* A gap exists when an operation, child role, or overlap cannot be classified, or when applicable rules conflict. Resolve that gap at the smallest reusable category.
* Examples illustrate derived results and are not a whitelist of supported arrangements. A conflicting example must be corrected against the normative rules.

### Coverage and exclusions

Explicitly excluded syntax is outside the profile's measurement scope. Unsupported syntax is within that scope but cannot yet be classified. These cases are distinct from a recognized operation with zero contribution.

Identify the source span and unsupported category in diagnostic output. A partial sum is not a complete score.

The analyzer records unsupported syntax in diagnostics separately from numeric node scores. Aggregation excludes every contribution on physical lines covered by diagnostic ranges from all three totals, including contributions belonging to other functions. A half-open range covers the rows of its source units; an empty range covers the insertion row. Explain uses the same projection; discovery completeness remains separate. A function error is the first relevant diagnostic by source position, code and message. An unlocated diagnostic owned by the function follows located diagnostics and is ordered by code and message; it does not mask a row.

## Cyclomatic Complexity

A written construct can combine a declarator with an explicit conditional
failure path. Classify its binding and its control operation separately: one
declarator and one conditional operation, not one decision per bound name. The
initializer is a header expression, and the failure body is a direct branch.
The clause naming that branch adds no second operation. A branch that does not
transfer a value to its enclosing construct has no branch-result point merely
because it ends in an expression; operations within it remain measurable.
Language profiles identify which syntax has these roles.

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

A logical sequence consists of connected AND/OR operators in the syntax tree. Grouping parentheses preserve the connection. Operators outside the sequence separate the sequences in their operands. Analyze those operands recursively under their own contexts.

Process the operators in a sequence in source order. Visiting a separate context, such as a call argument, preserves the enclosing sequence's state.

Logical-sequence increments without nesting cost:

| Rule | Description | Example | Point |
| --- | --- | --- | ---: |
| Logical sequence | The first operator of each AND/OR sequence contributes an increment. | `a && b` | +1 |
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

A declarator introduces a variable, a constant, or a field that stores a value. The initializer is optional and has its own expression context. Analyze its operations recursively. The initializer syntax does not itself contribute an assignment point.

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
| Branch result | Each value-producing branch contributes one result point, separately from contained calls. | `if condition { value } else { other }` | +1 per branch value |
| Branch label | Branch labels add no points. | `else {}` | 0 |
| Selection | The whole selection result adds no second implicit return. | `outer f { if a { 1 } else { 2 } }` | 0 additional |
| Selection | Passing the selection result into its declarator adds no further point. | `let x = if a { 1 } else { 2 };` | 0 additional |
| Explicit return | An explicit return replaces the implicit return at the same position. | `if a { return value; }` | 0 implicit-return points |

Selection-value requirements:

* Every written branch contributes, regardless of which branch executes.
* The same rules govern nested selections recursively. A complete selection is not another returned value.
* The enclosing declarator contributes separately when the selection initializes a variable.
* Applicable syntax and examples are defined by the [Rust selection rules](rust-metric-rules.md#trailing-selections-in-rust) and [JavaScript conditional rule](javascript-metric-rules.md#conditional-operator-in-javascript).

A branch result or block result transfers a value to its enclosing expression. An implicit function return transfers a value from a function. The scoring convention gives each result boundary one point, but forwarding the same result through enclosing blocks or selections adds no duplicate point.

Propagate result context through parentheses and result-producing blocks or selections. Charge the point at the terminal value expression. A nested selection delegates to its result branches; an explicit return replaces the implicit result at that position. Calls within any result expression still contribute separately.

Ordinary arguments and initializer expressions do not acquire return points merely because they produce values. Result points arise from the function, block, or selection rules. A call inside such a context retains ordinary argument contexts for its own arguments.

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

An expression-statement wrapper is a fallback point. Add it only when its expression has no counted call, assignment, update, control operation, or block operation in the same expression context. Search recursively through ordinary operands, receivers, and arguments. Parentheses preserve the context.

A nested function body, block body, or separate statement or declarator starts a different expression context. Operations inside that context do not suppress the enclosing wrapper. A counted block or selection itself can suppress the wrapper without inspecting its body. Returned-value contexts use the result rules instead of this fallback.

Thus `1 + save();` has one call point and no wrapper point. The same rule applies at any operand depth; no separate rule is needed for each enclosing operator.

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

### Delegated clarifications: suspension, environment, and debugging

The following are delegated specification decisions, not consequences of the earlier examples. Count each written explicit suspension that transfers control and a yielded value to a consuming caller in a generator protocol and permits later resumption as one Statements operation, whether it is an expression or a statement. Its operand is analyzed normally; resumption, delegation protocols, and implicit calls add no operations. An expression-statement wrapper is suppressed by this operation in the same expression context. A suspension is not an explicit return or a decision.

Count an explicit statement that establishes a temporary name-resolution environment for its direct body as one Statements operation. Its header and body are analyzed separately, and a direct body block adds no extra block point. This role does not by itself increase Cognitive depth or add a Cyclomatic decision. Do not infer this role merely from an arbitrary block.

Count each explicit debugger command as one Statements operation, independent of whether a debugger is attached. It is not a call, a decision, or an empty statement; its terminator adds no point. These are three distinct categories and do not classify other operations merely by their AST names.
