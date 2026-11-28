# Express conditions and decisions

## Goal

Demonstrate different forms for expressing applicability, alternatives, and conditional actions.

## Examples

### Conditional instructions

Use a sentence when a condition and its consequence belong together.

If a record has an invalid timestamp, retain the original value and report the error. Otherwise, convert the timestamp to UTC.

Use the CSV exporter for tabular records. Do not use it for unstructured log messages.

### Named alternatives

Separate alternatives when each requires its own explanation.

**Exact match.** Use this mode when the search term is an identifier whose spelling must be preserved.

**Fuzzy match.** Use this mode when the user may supply a partial name or alternative spelling.

### Grouped choices

Choose one output format according to the intended use:

* **For reading:** Markdown or HTML.
* **For processing:** CSV or JSON.
* **For preservation:** the original format.

A compact list can also distinguish an open set from a closed one.

Relevant evidence may include logs, measurements, or screenshots. Include other evidence that clarifies the result.

The protocol accepts only these status values:

* `active`
* `paused`
* `closed`

> A missing status is not equivalent to `paused`.

### Comparable alternatives

Use a table when alternatives share comparison fields.

| Format | Native nested objects | Typical use |
| --- | --- | --- |
| CSV | No | Flat tabular data |
| JSON | Yes | Structured data interchange |

A decision table connects distinguishable findings to actions:

| Finding | Action |
| --- | --- |
| Source and export agree | Retain the verified result. |
| Values differ | Identify the affected records. |
| Source is unavailable | Report that comparison is incomplete. |

### Decision tree

A text tree shows hierarchical choices and their destinations.

```text
Read the supplied document
    ├── Text available? ──→ Extract text
    └── Image only?
        ├── Legible ──────→ Transcribe
        └── Unreadable ───→ Report the limitation
```

### Contrasting instructions

**Avoid:** Check the file carefully.

**Prefer:** Compare the file's record count and column names with the source.

The pair contrasts an unspecified activity with a concrete instruction.

**Bad:** Treat a missing reading as zero.

**Good:** Keep missing readings distinct from measured zero values.

A reasoning/consequence table illustrates why an assumption matters.

| Reasoning | Consequence |
| --- | --- |
| Empty fields can be discarded. | A meaningful absence may disappear. |
| Matching totals prove matching records. | Different records can produce the same total. |
