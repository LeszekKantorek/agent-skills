# Authoring context

These independent fictional examples show different ways to express instructions in Markdown. Use the shortest form that preserves the intended meaning. They are not a template, required sections, or procedures to execute.

## Direct instructions and conditions

```markdown
Inspect the existing export before changing its format. Preserve field names, units, and ordering unless the requested change requires otherwise.

If the export has no schema, infer its fields from the available records. Keep uncertain field types explicit.

Do not overwrite the original export.
```

## Grouped instructions

```markdown
Distinguish:

- Required fields and optional fields.
- Observed values and inferred types.
- Invalid records and records that cannot be verified.
```

## Short procedure

```markdown
1. Locate the export and its schema.
2. Compare the records with the schema.
3. Record invalid fields and unresolved types.
```

## Substantial step

```markdown
### Validate the exported records

Compare the records with the schema selected earlier.

Check:

- Required fields.
- Field types and permitted values.
- References to other records.

If a field has no declared type, retain the inferred type as a proposal. Do not treat it as a schema requirement.
```

## Grouped choices

```markdown
Choose one output format according to the intended use:

- **For review:** Markdown or HTML.
- **For data processing:** CSV or JSON.
- **For archival:** original format.
```

## Alternatives with different consequences

```markdown
**Update the existing schema**

Use this approach when the change is compatible with its consumers. Retain existing identifiers.

**Create a new schema version**

Use this approach when the change breaks an existing contract. Identify consumers that require migration.

If compatibility cannot be established, report the uncertainty before replacing the schema.
```

## Exact values and qualifications

```markdown
Accept only these status values:

- `pending`
- `accepted`
- `rejected`

> A missing status does not imply `pending`.

Record other findings separately; do not introduce additional status values.
```

## Comparable fields

```markdown
Record each confirmed mismatch:

| Field | Expected | Observed |
| --- | --- | --- |
| amount | Integer | String |
| status | Required | Missing |
```

## Commands and structures

````markdown
Save the validation evidence under:

```text
validation/
├── findings.md
└── invalid-records.json
```

Run the project validator:

```sh
python validate.py --schema schema.json export.json
```

Inspect the reported failures before declaring the export valid.
````

## Completion criteria

```markdown
The validation is complete when:

- [ ] Every record has been checked against the selected schema.
- [ ] Invalid records have been identified.
- [ ] Unverified fields and missing evidence are explicit.
```
