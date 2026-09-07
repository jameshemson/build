# Implement relay (mixed mode)

This file is the normative contract for the `mixed`-mode implement relay: one active delivery
slice, dispatched to Codex through the portable `implement-slice` skill, then judged and completed
by root. It never changes which phases run. A named `implement` agent route wins over the mode and
dispatches that agent instead.

## Attempt sequence

Every attempt follows one order: root persists `active_slice`; commits retained work if the tree is dirty; runs `buildctl repository-identity` once and writes the `agent_progress` entry for the attempt with `supervision_mode: relay`, `attempt`, `command`, `log_path`, `evidence_dir`, `dispatched_at`, immutable `deadline_at` computed from the slice's `relay_deadline_minutes` (60 when absent, with a `history` line saying so), and the pre-launch identity `head_commit`, `branch` from `git branch --show-current`, and `index_sha256`; appends the counter event and runs `check-counters`; snapshots `{slug}-state.md` and `{slug}-implementation-summary.md` byte-for-byte under `.build/relay/{slug}/{slice_id}-{attempt}/`; captures `{repository_fingerprint}` with a second `buildctl repository-identity` call, writes it with the full command to `dispatch.json` in that same directory, and launches. Nothing is written to state between the snapshot and the terminal comparison; the fingerprint enters `history` only after that comparison.

The launch is `codex exec -s workspace-write -C {repo-root} -m gpt-5.6-sol -c model_reasoning_effort="high"` carrying the implement template from [workflow modes](workflow-modes.md), supervised until the relay exits or `deadline_at` passes.

## Acceptance

Root validates the result before it trusts it: shape, scope, and state first, then status; complete slice evidence is required only for `done`.

**Shape.** `{slug}-implementation-summary.md` contains exactly one `## Slice {slice_id} relay result` section, ending in one parseable `Slice result` block with exactly eight keys: `schema_version` (1), `slice_id` (the active slice), `evidence_dir` (this attempt's directory), `repository` (the dispatched fingerprint), `status` (`done`, `needs-decision`, or `blocked`), `tasks_completed` (a subset of the slice's `task_ids`), `commands` (a list of `{command, exit_code, observed}`), and `decision` (null for `done` and `blocked`; for `needs-decision` a map with a non-empty `question`, two or more `options`, an `evidence` list, and `completed_meanwhile` as a subset of `task_ids`). A block naming an earlier attempt's `evidence_dir` is stale and fails shape.

**Identity.** Root records the pre-launch commit, branch, and index identity and rejects any outcome that changed them; a changed commit or branch halts with retained evidence instead of a silent restore. Compare `git rev-parse HEAD`, `git branch --show-current`, and a fresh `repository-identity` `index_sha256` with the recorded values; a changed index under an unchanged commit is a discard, not a halt.

**Scope.** List changes with `git status --porcelain=v1 -z --untracked-files=all`. For a rename record, both the source and the target path must be inside the active slice's `files_modified` union; for every other record, its own path must be.

**State.** `{slug}-state.md` is byte-identical to its snapshot.

**Summary.** Every byte of the summary outside the active slice's section must equal the pre-launch snapshot before any outcome is accepted. Remove the `## Slice {slice_id} relay result` section from both texts and compare the remainder.

**Status.** `done` additionally requires `buildctl run-evidence --contract {contract} --evidence-dir {evidence_dir} --check-only` to return `ok: true`, and `done` requires a receipt for every task `verify`, the slice `verify`, and every behavioral or command evidence ref, each carrying its literal observation. Every such command appears in `ledger.commands`, for each behavioral-test or command-assertion ref the receipt's `stdout.tail` or `stderr.tail` contains the observation, and `tasks_completed` equals the slice's `task_ids` as a set. `needs-decision` requires only shape, scope, and state. `blocked` is a discarded run, and so is any run that ends without its section, including one that stopped to propose or to ask. A valid `needs-decision` is accepted with partial or absent evidence, its question is persisted, and its work is retained.

## Outcomes

**`done`.** Root appends the accepted `tasks_completed` to `completed_tasks` before the checkpoint. It then continues at Phase 3 step 7 with the relay section as provisional evidence, and at step 8 for the checkpoint.

**`needs-decision`.** A relay stop: root commits retained work, writes the `decision` row and a `history` line, resolves the question itself when the plan, requirements, or context already determine the answer and otherwise asks the user with AskUserQuestion, records the resolution as the next `D-###` in `{slug}-requirements.md`, clears `decision` with a `history` line, and re-dispatches the same relay command with the next attempt number. The re-dispatched run keeps `completed_meanwhile` work and finishes the remaining tasks.

## Baselines and discard

Before any re-dispatch root commits retained work so that HEAD is the attempt baseline, and a discarded attempt is restored to that baseline. Retained-work commits use the message `wip({slug} {slice_id}): retained relay work, attempt {n}, {status}` and are listed in `history`.

A discarded attempt is restored with `git reset --hard` to the recorded pre-launch commit followed by `git clean -fd`, and no retry or fallback launches until the status is clean and the index identity matches the record. In order: terminate the run if it is alive; confirm HEAD and the branch equal the recorded values, because a difference is the identity halt above and not a discard; restore; confirm `git status --porcelain=v1 -z --untracked-files=all` is empty and a fresh `repository-identity` `index_sha256` equals the recorded value; restore the state and summary snapshots; move `{evidence_dir}` to `.build/relay/{slug}/discarded/`; append the `agent_retry` counter event with scope `relay:{slice_id}`; run `check-counters`. Both restore steps leave the gitignored `.build/` tree in place.

## Repair

Mid-review fixes reopen their task IDs and travel to the next attempt as a `### Repair requested` subsection; root never applies them inline. Root records `fixes_needed`, removes the named task IDs from `completed_tasks`, appends the `### Repair requested` subsection carrying the findings and the reopened IDs to the slice section, commits retained work, and re-dispatches. The next attempt is accepted under the same checks, and mid-review runs again before the checkpoint.

## Resume

Mid-review acceptance is not durable: on resume with every slice task complete and no checkpoint commit, root re-runs mid-review before the checkpoint. A pending `fixes_needed` is applied through the repair handoff first, and a RETHINK outcome returns to planning as it does today.

On resume with a relay attempt whose `terminal_status` is null, root compares the current branch and HEAD with that attempt's recorded identity before any branch checkout; a mismatch is the identity halt, never a silent restore.

## Retry and fallback

A discarded attempt is retried once from a fresh `codex exec`. A second discard, a deadline kill, or a launch that fails to start or exits within two minutes with no section and output naming capacity, quota, rate limit, or authentication appends `model_fallback` and dispatches a fresh Claude agent with `model: opus` that executes the `implement-slice` protocol for the same slice in the main worktree, judged by the same checks. A discarded fallback halts through the `agent_retry` limit. An implement relay never falls back to inline root.

## Invariants

An implement relay never commits; root alone commits retained work, runs the slice's integration command once, makes the checkpoint commit, writes the completion marker, runs post-checkpoint `run-evidence` into `.build/evidence/{slug}/`, authors judgments, and applies the `complete-slice` receipt.

The relay appends one line per task to `.build/plans/{slug}-progress.log`; root may report those lines and never treats silence as failure, because the deadline is the only timeout.

During a relayed implement phase root edits no source file and runs no task-level command.
