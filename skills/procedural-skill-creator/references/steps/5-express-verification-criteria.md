# Express verification criteria

## Goal

Demonstrate forms for expected behavior, acceptance criteria, warning signs, and corrections.

## Examples

### Acceptance criteria

A criterion states a property of the result rather than an activity.

The export includes every selected record and no records outside the selection. The original order is preserved.

### Checklist

A checklist separates properties whose completion can be assessed individually.

- [ ] Column names match the agreed schema.
- [ ] Record count matches the selected source records.
- [ ] Missing values remain distinguishable from zero.
- [ ] Original records remain unchanged.

### Completion condition

A sentence can connect completion to a specific outcome:

The comparison is complete when each selected record has a confirmed match or a reported discrepancy.

### Red flags

Warning signs indicate where further investigation may be useful. They are not established failures.

* An unexpected change in record count.
* A large increase in missing values.
* Different records sharing the same identifier.

### Expected and observed results

Use a table when multiple observations share the same comparison fields.

| Check | Expected | Observed |
| --- | --- | --- |
| Record count | 240 | 238 |
| Encoding | UTF-8 | UTF-8 |

A labeled paragraph can describe a finding that needs additional context.

**Expected:** Each record retains its original identifier.

**Observed:** Two records have empty identifiers.

**Follow-up:** Compare the affected records with the source to distinguish missing source data from an export defect.

### Conditional correction

If a mismatch is introduced by the export, correct the transformation and repeat the affected comparison. If the source itself is incomplete, report the limitation without inventing missing data.
