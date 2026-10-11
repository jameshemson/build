# Discovery interview

Two callers follow this file: impl-plan Step 0 when it runs standalone, and the build
orchestrator in its Phase 1, after codebase exploration and before planning. It follows
the grilling method. You do the research, the user makes the decisions, and you keep
asking until you both agree on what will be built.

## Facts first

Facts are yours to find; decisions are the user's.

Before you draft any question, list every ambiguity you noticed in the targeted read.
Then settle every fact you can. Read the code, the tests and the docs. Where the harness
has sub-agents, send read-only ones to answer questions that need a wider search. Never
ask the user something the code answers.

Only decisions the code cannot settle become questions. A decision is a choice between
outcomes the user cares about: what the feature does, how it behaves at the edges, and
what it leaves alone.

## What to ask

Ask about the feature itself, grounded in the code. Name the real files, functions and
patterns involved, so the user can see what each answer changes. Do not ask a question
whose answer is obvious from the code or from the request.

Ask these standard questions only when the request leaves them open:

- Definition of done: what does "shipped and working" look like in concrete terms?
- Constraints not visible in the code: deadlines, things that must not change, earlier
  attempts that failed.
- Out of scope: what is the obvious next request that we are not building now?

Never ask who is affected or why now. The request is the reason; take it as given.

When nothing is genuinely open, still ask one round. Present the 2-4 assumptions the plan
will rest on and ask the user to confirm them. Word each one so that the recommended
answer accepts it.

## Rounds

Ask in rounds. Each round asks the whole frontier.

The frontier is every decision whose prerequisites are already settled. Ask all of them
together, not one at a time. A question that depends on an answer still open waits for a
later round. Asking it now would force the user to guess.

After each round, record the answers and work out the frontier again. Later rounds ask
what the answers unblocked. When an answer undoes an earlier one, re-open that branch:
the decisions that rested on the old answer go back on the frontier.

If an answer raises a new fact, settle it from the code as in "Facts first". Do not turn
it into a question.

## Presenting questions

When the harness provides an interactive question tool, use it; otherwise ask in plain
text.

With the tool (for example AskUserQuestion on Claude Code):

- Put at most 4 questions on one screen, and give each question 2-4 options. A larger
  round spans consecutive screens.
- List the options with the recommended answer first. End its label with
  `(Recommended)` and use its description for a one-line rationale.
- Word each question so that picking the first option accepts the recommendation.
- When the tool offers its own free-text answer, do not add an "Other" option;
  otherwise include one.

In plain text:

- Number the questions.
- Follow each question with a line that gives the recommended answer and a one-line
  rationale, so the user can answer by number.
- Then stop and wait for the answers.

## Ending

There is no cap on rounds or questions. Keep going until nothing that would change the
plan is still open. Do not stop early because the interview feels long.

The user can end the interview early by saying "wrap up" or "just plan it". Then every
decision that is still open becomes an `A-*` assumption with `low` confidence, listed
under the plan's Open questions (or with the assumptions in a compact plan).

End with a confirmation. Summarise, in a few lines:

- what will be built;
- the decisions made;
- what is out of scope.

Ask the user to confirm the summary, presented like any other question: with the tool,
one screen whose first option is `Yes, plan it (Recommended)` and whose other option asks
for a correction; in plain text, a numbered line to confirm or correct. Planning starts
only after the user confirms. If the user corrects the summary, treat the correction as
an answer and run another round.

## Recording answers

Every answer becomes a `D-*` decision. Its evidence reads
`user statement, <YYYY-MM-DD>: "<the answer, quoted>"`, with the date of the interview.

Anything you inferred, rather than heard from the user, stays an `A-*` assumption. Give it
a confidence (`high`, `medium` or `low`) and evidence from files, commands or user
statements. An inference does not become a decision just because the user did not object.
