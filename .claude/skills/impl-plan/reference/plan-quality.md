# Plan Quality Rules

Read this before writing any implementation plan. These rules are non-negotiable.

## Banned Placeholder Language

The following patterns are NEVER acceptable in a plan. Each is a plan failure - replace with specifics or remove.

**Vague deferrals:**
- "TBD", "TODO", "to be determined"
- "implement later", "will be handled in a future step"
- "details to follow", "see above" (without specifics)

**Lazy descriptions:**
- "add appropriate error handling" - name WHICH errors and HOW to handle each
- "add validation" - specify WHAT validation, against WHAT rules, with WHAT error messages
- "handle edge cases" - name EACH edge case and its specific handling
- "update tests accordingly" - specify WHICH tests, testing WHAT behavior, with WHAT assertions
- "follow existing patterns" - name the PATTERN, WHERE it's used, and WHAT to replicate
- "similar to Task N" - repeat the specifics, the reader may be reading tasks out of order

**Missing substance:**
- Steps that describe intent without showing the concrete change
- Any step a developer would need to "figure out" to execute
- References to types, functions, or methods not defined anywhere in the plan

## Good vs Bad Steps

**BAD:** "Add error handling to the API endpoint"
**GOOD:** "In `routes/api/users.ts`, wrap the `createUser` handler in try/catch. On `DuplicateEmailError`, return 409 with `{ error: 'email_taken' }`. On `ValidationError`, return 400 with the Zod error's `flatten()` output. On unknown errors, log with request ID and return 500."

**BAD:** "Write tests for the auth module"
**GOOD:** "In `tests/auth/validate.test.ts`, add three tests: (1) valid JWT returns user object with id and email, (2) expired JWT throws `TokenExpiredError`, (3) malformed string throws `InvalidTokenError`."

**BAD:** "Update the database schema"
**GOOD:** "Add migration `002_add_user_preferences.sql`: CREATE TABLE user_preferences (user_id UUID REFERENCES users(id) ON DELETE CASCADE, theme VARCHAR(20) DEFAULT 'system', notifications_enabled BOOLEAN DEFAULT true, PRIMARY KEY (user_id))."

**BAD:** "Similar to the handler in Task 2"
**GOOD:** "Add a DELETE handler at `/api/users/:id` that: validates the :id param is a UUID, calls `userService.softDelete(id)`, returns 204 on success, returns 404 if user not found, returns 403 if the authenticated user is not an admin."

## File Map Template

Before defining tasks, map every file you'll touch:

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `src/auth/validate.ts` | New | JWT token validation | `src/types/auth.ts` |
| `src/routes/api/users.ts` | Modified | Add DELETE endpoint | `src/auth/validate.ts` |
| `tests/auth/validate.test.ts` | New | Tests for validation | `src/auth/validate.ts` |

Every file in this map must appear in the implementation steps. Every file in the implementation steps must appear in this map.

## Self-Review Checklist

Run these checks after writing the plan. All must pass before delivering.

### 1. Spec coverage
Read the feature description again. For each requirement, can you point to a specific implementation step that addresses it? List any gaps.

### 2. Placeholder scan
Search your plan for any phrase from the banned list above. Also search for: vague verbs without objects ("handle", "process", "manage" without specifying what), conditional language without specifics ("if needed", "as appropriate", "when necessary"). Zero violations required.

### 3. Type consistency
Check that the same types, interfaces, function names, and property names are spelled identically throughout. A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug in the plan.

### 4. File map matches implementation order
Every file in the map has at least one implementation step. Every file touched in the steps is in the map.

### 5. All sections present
Every required section exists. Sections that don't apply say "N/A" with a brief explanation - they are not silently omitted.

If you find issues, fix them inline. Then move on.
