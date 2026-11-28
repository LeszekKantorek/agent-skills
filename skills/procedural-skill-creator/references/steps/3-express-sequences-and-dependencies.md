# Express sequences and dependencies

## Goal

Demonstrate how to represent execution order, dependencies, branches, and delegation.

## Examples

### Ordered list

Numbered items express order. Indented content remains part of its parent step.

1. Open the source file.

2. Determine whether the file has a header.

   * Identify the delimiter.
   * If a header is present, record the column names.

   | Header condition | Next action |
   | --- | --- |
   | Present | Use the declared names. |
   | Missing | Request or identify the column mapping. |

3. Read the records using the established mapping.

### Numbered headings

For a longer action, a heading gives related instructions their own scope.

#### 1. Capture the original measurement

Record the value, unit, and measurement conditions.

#### 2. Repeat the measurement

Use the same conditions. Record any difference in the setup.

### Compact sequence

Arrows can express a short chain without separate step descriptions.

```text
Read configuration → Validate values → Start the service
```

### Parallel branches

A fork and join show which actions are independent and where their results meet.

```text
Selected dataset
    ├── Count records ──────────┐
    └── Inspect field types ────┤
                                ↓
                         Summarize findings
```

### Conditional branches and corrections

A diagram can distinguish continuation, rework, and an unresolved outcome.

```text
Validate the export
    ├── Valid ──────────────→ Report success
    ├── Correctable error ──→ Correct → Validate again
    └── Missing source ─────→ Report incomplete verification
```

### Linked delegation

The [orchestration example](../working-example.md#orchestration) pairs step links with responsibilities and results. Its layout illustrates a lead-agent document with separate instruction files.

A linked task can combine an action, the information relevant to it, and its expected contribution in one sentence rather than a fixed set of fields.
