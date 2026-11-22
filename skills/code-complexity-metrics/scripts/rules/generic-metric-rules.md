# Generic metric rules

Rules version: **2.5**.

The shared rules and the relevant language document form one scoring profile:

* [Rust metric rules](rust-metric-rules.md).
* [JavaScript metric rules](javascript-metric-rules.md).

Use these rules for both local scores and call dependencies.

* This profile defines scoring and test expectations. Derive combinations of recognized constructs using the recursive composition rules below.
* Measurements use written syntax. The graph resolves a call when syntax identifies a unique target in the analyzed projects.
* Rules are versioned independently of the parser. Parser updates do not change the scoring rules.
* An **outer** is a function without an enclosing function. Only outers receive report records and contribute to reported function counts.
* Module-level functions, methods, anonymous functions, and closures outside another function can be outers. Visibility and exports do not determine ownership.
* A **nested function** is defined inside another function. Its code belongs to its enclosing outer, including through several nesting levels.
* Nested methods follow the same ownership rule. Internal locations do not create separate or duplicate results.
* Each scored operation contributes once, regardless of reachability or execution count. One syntax construct can contain several operations. Nested bodies contribute even when uncalled.
* Equivalent constructs and control-flow structures have the same scores across languages. Each language analyzer applies this requirement to its syntax.
* Syntax without an equivalent does not require an artificial counterpart. Arbitrary semantically equivalent programs need not have the same scores.
* Cognitive Complexity is a nonnegative integer. Halstead Volume uses a nonnegative number calculated from integer counts. A result with an error describes the contributions that remain after excluding affected physical lines.
* Reference totals are expectations derived from the rules, not a test execution report.

Table examples use pseudocode; `outer`, `select`, and `closure` denote language-independent constructs. Points describe only the named construct unless the rule specifies a total. Language documents map syntax to these rules and define exceptions.

## Recursive composition

An operation is a scored action or structural boundary. The term describes the meaning of a rule, not a required node type. The language analyzer applies these rules directly to Analyze AST nodes, using their syntax, child roles, and metric context.

### Analysis structure and responsibilities

Tree-sitter parses the source with the language grammar. A registry selects the language analyzer once per file. The analyzer prepares the tree, then applies the scoring rules.

1. Build Analyze AST, preserving parser node types, child fields, child order, relevant tokens, and original source locations.
2. Complete syntax that requires additional parsing, such as Rust macro arguments. Finish the structure before scoring.
3. Traverse for Cognitive Complexity and write each node's contribution to `score.cognitive`.
4. Record Halstead occurrences within each reported function body.

Each node starts with `score: { cognitive: 0 }`. This field contains only that node's local contributions. A node can represent several scored actions. A single action represented by multiple parser nodes contributes only once.

Cognitive carries nesting depth and logical-sequence state without changing the prepared tree structure.

Rust and JavaScript each implement the shared rules in their language analyzer.

The analyzer returns the tree, reported functions, node ownership, and diagnostics. Ownership and diagnostics are stored separately from tree nodes. Nodes retain parser locations for reports and `--explain`, without a duplicate `sourceRange`. They store no `subtreeScore`, `analyzed`, or `ownScore` fields.

Aggregation recursively sums local `score` values according to node ownership. JSON, CSV, Markdown, and `--explain` use these contributions and the original source locations.

Source indices and columns count UTF-16 code units. Internal rows and columns are zero-based; range ends are exclusive. Reports use one-based rows and columns. A tab occupies one code unit, and a character outside the BMP occupies two. CRLF occupies two index units and ends one row.

The analyzer assigns a construct's contribution to the node identified by its scoring rule. Logical operator contributions belong to operator tokens. Assign each contribution to a single node.

`--explain` places each node's local score on its original start row. Contributions with the same outer and start row are added together. Recovered macro arguments follow the same convention after mapping their positions to the original source.

### Apply rules to arbitrary nesting

1. Interpret each recognized node using its type, parent, child field, and context. Preserve roles such as condition, body, argument, receiver, initializer, and branch result.
2. Determine the node's local Cognitive contribution. A contribution of zero does not suppress its children.
3. Visit every included child recursively, using the context defined for that role. Apply the same rules at every nesting level.
4. After scoring, aggregate contributions into the owning outer.
5. Produce totals and source explanations from the same contributions. Formatting or flattening the structure must not change the score.

Recursive aggregation adds each node's local contribution and then visits its children. Context determines local contributions during scoring, before aggregation. Cognitive sequence points follow the logical-sequence rules rather than adding one point for every logical-expression node.

Context is scoped to the relevant child. Restore the enclosing context after visiting that child. Calls do not increase Cognitive depth or interrupt traversal of their receivers and arguments.

Parentheses, expression wrappers, and multiple syntax nodes representing one operation do not duplicate its contribution.

Nested function bodies contribute through their written definitions. A call never traverses the target function's body. Apply ownership and nesting rules even when a function appears inside an argument or initializer.

### Resolve overlap and genuine gaps

* Apply the shared rule after mapping language syntax. A language exception overrides only the contribution or traversal boundary it explicitly names.
* A rule assigning zero to a construct changes its own contribution only. Excluding descendants requires an explicit exclusion rule.
* Combine distinct scored constructs using the applicable nesting and sequence rules.
* A new arrangement of recognized operations is not a specification gap. Derive its score without requesting a combination-specific rule.
* A gap exists when an operation, child role, or overlap cannot be classified, or when applicable rules conflict. Resolve that gap at the smallest reusable category.
* Examples illustrate derived results and are not a whitelist of supported arrangements. A conflicting example must be corrected against the normative rules.

### Coverage and exclusions

Explicitly excluded syntax is outside the profile's measurement scope. Unsupported syntax is within that scope but cannot yet be classified. These cases are distinct from a recognized operation with zero contribution.

Identify the source span and unsupported category in diagnostic output. A partial sum is not a complete score.

The analyzer records unsupported syntax in diagnostics separately from numeric node scores. Aggregation excludes every contribution on physical lines covered by diagnostic ranges, including contributions belonging to other functions. A half-open range covers the rows of its source units. An empty range covers the insertion row. Explain uses the same projection. Discovery completeness remains separate.

A function error is the first relevant diagnostic by source position, code, and message. An unlocated diagnostic owned by the function follows located diagnostics and is ordered by code and message. It does not mask a row.

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

## Halstead Volume

Halstead Volume measures the number and variety of operators and operands in the written implementation.

| Count | Meaning |
| --- | --- |
| `N1` | Operator occurrences |
| `N2` | Operand occurrences |
| `η1` | Distinct operator keys |
| `η2` | Distinct operand keys |

When `η1 + η2` is at most 1, Volume is 0. Otherwise, calculate `(N1 + N2) × log₂(η1 + η2)`.

1. Visit the body of each outer. Include declarations, headers, and bodies of functions nested inside that body. The outer's own header is outside the Halstead scope.
2. Classify written operations, identifiers, and literals using the language mappings. Operators use keys for the operation. Operand keys use a category and the exact source spelling.
3. Record each occurrence once with its original source location. Exclude occurrences whose starting row is covered by a diagnostic, as for Cognitive Complexity.
4. Add the surviving occurrences and count the distinct keys in each category separately. Calculate Volume once for the entire outer.

The classification follows written syntax. It ignores structural punctuation and comments and visits written call targets and arguments. It includes uncalled nested bodies and skips analysis of callees outside the outer. Operations represented by both a token and its enclosing node contribute once.

Use the same operator key for shared roles such as `call`, `index`, and `member_access`. For a method call such as `obj.run()`, access to the method and invocation are distinct operations. The enclosing parentheses add no occurrence.

JSON retains the numeric result. CSV and Markdown display Volume to two decimal places.

`--explain` gives one Volume for the outer. The fragment column shows source lines. The five columns beside it show the Cognitive increment and additions to `N1`, `N2`, `eta1`, and `eta2`. Each distinct item increases `eta1` or `eta2` on its first retained source line.

Adding the line values recovers the function totals. A dash marks an unavailable Cognitive increment. The report puts numbers for lines that cannot be annotated safely below the code block with the original line number.

## Call graph

The analyzer builds a separate graph for each project containing a report file. Files selected by `--path` and functions selected by `--filter` limit the report. Surrounding project sources contribute callers and targets to the graph. A function identity includes its declaration location and language context. File aliases resolve through the same physical declaration. Calls with multiple possible targets or an unknown target remain unresolved.

An explicitly selected file under `node_modules` or a Cargo build directory gets a graph limited to that file.

| Metric | Calculation |
| --- | --- |
| Fan-In | Count distinct functions that call the reported outer. Use the nearest caller, so two separate closures can count as two callers. |
| Fan-Out | Count distinct destinations from the outer and its nested functions. Use the resolved definition when available. Otherwise use a named path visible in the source. Include local closures and Rust macro paths. |
| Instability | Divide Fan-Out by Fan-In plus Fan-Out. Report `NaN` when both are zero. |

An edge from a function to itself adds no point. A call from file scope adds no Fan-In. Repeated calls to the same target contribute once in Fan-Out. Repeated calls from the same caller contribute once in Fan-In.

Report diagnostics describe the files selected for the report.

Resolvers use the [shared reason codes](../call-graph-reasons.mjs). Use `dynamic-member` for a call through a member with an unknown target. Use `dynamic-value` when the analyzer cannot identify the target from the bound value. Use `external-module` for calls through an external JavaScript module or Rust crate. Language-specific codes such as `trait-dispatch` and `computed-member` identify distinct resolution cases.

JSON retains numeric Instability without rounding. CSV, Markdown, and `--explain` display it to two decimal places. For undefined Instability, JSON uses the string `"NaN"`. Other formats display `NaN`.

JSON and `--explain` list each distinct caller counted in Fan-In with the location of its first call. They also list unresolved outgoing calls with their locations, written targets, and reasons. The `--explain` source table credits each Fan-Out destination to its first contributing line.
