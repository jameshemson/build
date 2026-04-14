# Implementation Plan: Add User Preferences to Build Plugin

## File structure mapping

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `src/api/routes.ts` | Modified | Add preference endpoints | `src/preferences/store.ts` |
| `src/preferences/store.ts` | New | Preference storage and retrieval | None |
| `src/preferences/types.ts` | New | TypeScript types for preferences | None |
| `src/preferences/defaults.ts` | New | Default preference values | `src/preferences/types.ts` |
| `tests/preferences/store.test.ts` | New | Tests for preference storage | `src/preferences/store.ts` |

## Problem

Users cannot persist preferences (theme, notification settings, default workstream count) between sessions, forcing them to reconfigure each time.

## Approach

Add a preferences module that reads/writes a `preferences.json` file in the `.build/` directory. Expose preferences through REST endpoints in the existing API router. Use a simple file-based store — no database needed for key-value user preferences.

## Who uses this and how

**Single user on their machine**: Opens settings, changes theme to dark, saves. Next session loads dark theme automatically.

**User with corrupted preferences file**: If `preferences.json` is malformed, the store falls back to defaults and logs a warning. The corrupted file is renamed to `preferences.json.bak`.

**User upgrading from a version without preferences**: No preferences file exists. All values return defaults. First save creates the file.

## Files to change

### `src/preferences/types.ts` (New, ~20 lines)
Define `UserPreferences` interface with fields: `theme: 'light' | 'dark' | 'system'`, `notificationsEnabled: boolean`, `defaultWorkstreams: number`, `autoArchive: boolean`.

### `src/preferences/defaults.ts` (New, ~10 lines)
Export `DEFAULT_PREFERENCES: UserPreferences` with values: theme='system', notificationsEnabled=true, defaultWorkstreams=3, autoArchive=true.

### `src/preferences/store.ts` (New, ~60 lines)
`savePrefs(prefs: UserPreferences): void` — validates prefs against the type, writes to `.build/preferences.json` as formatted JSON. `loadPreferences(): UserPreferences` — reads the file, merges with defaults for any missing keys, returns the result. If file doesn't exist, returns defaults. If file is malformed JSON, renames to `.bak` and returns defaults.

### `src/api/routes.ts` (Modified, +30 lines)
Add `GET /preferences` endpoint that calls `loadPreferences()` and returns the result as JSON. Add `PUT /preferences` endpoint that reads the request body, calls `savePreferences()`, and returns 200. Add appropriate error handling for invalid preference values.

### `tests/preferences/store.test.ts` (New, ~40 lines)
Test that `savePrefs()` writes valid JSON. Test that `loadPreferences()` returns defaults when no file exists. Update tests accordingly.

## Data impact

None. File-based storage in `.build/preferences.json`. No database, no migrations. Existing `.build/` directory already exists from the workflow state files.

## What existing behavior changes

The `src/api/routes.ts` file gets two new endpoints. No existing endpoints change. The `.build/` directory gains a new `preferences.json` file on first save.

## New dependencies

None. Uses Node.js built-in `fs` module for file operations and built-in `JSON.parse`/`JSON.stringify` for serialization.

## Access control and authorization

Local-only. The preferences endpoints are part of the local dev server. No authentication needed — single user on their own machine.

## Abuse and edge cases

- **Very large preference values**: The `defaultWorkstreams` field is a number. No upper bound enforced — user could set it to 999999. Mitigation: clamp to 1-20 range in `savePrefs()`.
- **Concurrent writes**: Two sessions saving preferences simultaneously could produce a corrupt file. Mitigation: use `writeFileSync` with a temp file and atomic rename.
- **Missing .build/ directory**: The store should create `.build/` if it doesn't exist before writing.

## Out of scope

- Per-project preferences (only global preferences for now)
- Preference sync across machines
- Preference UI — this is API-only, UI comes later

## Parallel workstreams

| Workstream | Files | Complexity | Depends on |
|-----------|-------|------------|------------|
| api-endpoints | `src/api/routes.ts`, `tests/preferences/store.test.ts` | simple | None |
| preference-storage | `src/preferences/store.ts`, `src/preferences/types.ts`, `src/preferences/defaults.ts`, `src/api/routes.ts` | complex | None |

## Risks and rollback

1. **Corrupted preferences file breaks startup**: If the load function throws instead of falling back to defaults, the app won't start. Mitigation: the fallback-to-defaults behavior is tested explicitly.
2. **File permissions**: On some systems, `.build/` may not be writable. Mitigation: the store catches write errors and logs a warning.

Rollback: delete `src/preferences/` directory and revert the route changes. No data migration needed.

## Implementation order

1. Create `src/preferences/types.ts` with the `UserPreferences` interface
2. Create `src/preferences/defaults.ts` with `DEFAULT_PREFERENCES` export
3. Create `src/preferences/store.ts` with `savePrefs()` and `loadPreferences()` functions
4. Add `GET /preferences` and `PUT /preferences` endpoints to `src/api/routes.ts`
5. Add appropriate error handling for invalid preference values in the PUT endpoint
6. Create `tests/preferences/store.test.ts` with tests for save, load, defaults, and malformed file handling
7. Update tests accordingly for the new endpoints

## Verification

- Run `npm test` and verify all preference tests pass
- Manually test: save preferences via PUT, retrieve via GET, verify persistence across restart
- Test malformed file recovery: corrupt `preferences.json`, call GET, verify defaults returned and `.bak` file created
