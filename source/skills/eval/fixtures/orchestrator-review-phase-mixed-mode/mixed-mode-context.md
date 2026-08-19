# Context: mixed-mode

The customer store lives in `src/customers.js` behind a single `insert(record)` call; no bulk
import path exists today. CSV parsing has no existing dependency in the repo, and the plan should
add a small deterministic parser rather than a library, since none of the columns need
locale-aware quoting; malformed rows must be skipped and counted rather than aborting the whole
file, so a partial upload still imports its valid rows.
