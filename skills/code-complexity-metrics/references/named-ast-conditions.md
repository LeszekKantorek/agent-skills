# Name AST conditions and search predicates

This case uses metrics reported by analyzer version 1.x.

In the AST preparation code, we named boolean conditions by what they check. For example, the JavaScript analyzer uses `isCommentNode` to identify nodes whose source ranges belong in the comment list.

```js
// Before
if (n.type === 'comment' || n.type === 'html_comment') comments.push(loc);

// After
const isCommentNode = n.type === 'comment' || n.type === 'html_comment';
if (isCommentNode) comments.push(loc);
```

The name `isVariableNameNode` tells the reader what `find()` is looking for.

```js
// Before
binding = parent.children.find(c => c.field === 'name' && c.type === 'identifier');

// After
const isVariableNameNode = child =>
  child.field === 'name' && child.type === 'identifier';
binding = parent.children.find(isVariableNameNode);
```

Both analyzers also use a named set of node types whose source must be protected from annotations.

| Whole-file scores | Cognitive | Cyclomatic | Statement Count |
| --- | ---: | ---: | ---: |
| JavaScript [`analyze-ast.mjs`](../scripts/analyzers/javascript/analyze-ast.mjs) | 78 → 78 | 61 → 61 | 168 → 176 |
| Rust [`analyze-ast.mjs`](../scripts/analyzers/rust/analyze-ast.mjs) | 85 → 85 | 99 → 99 | 263 → 274 |

These totals cover the full refactor, including all local declarations and callbacks. The CLI totals cover reported functions and exclude module-level set declarations. Naming the checks makes their purpose visible where they are used. Here it adds local declarations while leaving Cognitive and Cyclomatic Complexity unchanged.
