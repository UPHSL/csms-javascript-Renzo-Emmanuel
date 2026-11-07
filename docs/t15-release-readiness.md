# T15 - Release Readiness Document

## 1. Developer Information

| Field | Value |
|---|---|
| Name | Renzo Emmanuel V. Ramos |
| GitHub Username | Renzo-Emmanuel |
| Technology Stack | JavaScript with Express.js (Node.js 24, EJS, node:sqlite) |
| T15 Branch | feature/t15-system-hardening |

---

## 2. Release Candidate Baseline

Before starting T15 hardening, the following were verified as working:

| Item | Status | Notes |
|---|---|---|
| Application startup | PASS | `npm start` launches Express server on port 3000 |
| /health endpoint | PASS | Returns JSON status payload |
| Dashboard | PASS | `/dashboard` renders with all metric sections |
| Resident Management | PASS | List, register, edit, deactivate all functional |
| Service Request Management | PASS | List, submit, search, filter, view, workflow all functional |
| Starter through T14 automated tests | PASS | 159 tests, 0 failures before T15 work began |

No existing problems were identified before starting T15.

---

## 3. Hardening Changes

| Area | Issue or Risk Found | Action Taken | Files Changed | Test/Evidence |
|---|---|---|---|---|
| 1. Full Regression | Reviewed all T01-T14 behavior together | No defect identified — all 159 tests pass as an integrated suite | None | Run 1 and Run 2 both green at 164 tests |
| 2. Invalid/Missing Input | Malformed route IDs (e.g. `/residents/abc/edit`) produce `NaN` — behavior was safe but untested | Verified `Number("abc")` → `NaN` → `findById(NaN)` returns `null` → controller renders controlled 404. Added Hardening Test 1 to prove it. | test/hardening.test.js | Hardening Test 1 passes |
| 3. Persistence Integrity | Rejected mutations (invalid SR transition) — behavior was safe but not explicitly tested by retrieving the full record afterward | Verified `ServiceRequestStatusService` rejects invalid transitions before any DB write. Added Hardening Test 2 to retrieve and verify every field after rejection. | test/hardening.test.js | Hardening Test 2 passes |
| 4. HTTP/Mutation Safety | All GET routes read-only, all mutations POST with POST/Redirect/GET — no defect found | Reviewed all controllers and routes. All mutations use POST + redirect. Added Hardening Test 3 to verify 10 GET requests across all endpoints leave persistence unchanged. | test/hardening.test.js | Hardening Test 3 passes |
| 5. Query/Database Safety | All SQL uses parameterized prepared statements (`prepare().get/all/run`) — no string concatenation found | Reviewed all repository methods including T14 aggregate queries. All use `?` parameter binding. Dashboard uses `COUNT(*)` at DB level. No defect identified. | None | Reviewed - no defect identified |
| 6. Workflow/Lifecycle | SR transition rules enforced server-side by `ServiceRequestStatusService` regardless of UI — no defect found | Reviewed `ALLOWED_TRANSITIONS` map and `SUPPORTED_STATUSES` set. Terminal states map to empty sets. Invalid transitions rejected even via direct POST. No defect identified. | None | Reviewed - no defect identified |
| 7. Interface/Navigation | Nav links present across all views with Dashboard, Residents, Service Requests — no broken links found | Reviewed all 7 EJS views. All use `<%= %>` (escaped output). No `<%- %>` (raw) found. Success/error messages present. No stack traces or SQL exposed. No defect identified. | None | Reviewed - no defect identified |
| 8. Test Reliability | Tests use isolated temp databases per test — no shared state, no hardcoded IDs, no order dependency | Verified by running complete suite twice consecutively. Both runs: 164 tests, 0 failures. No defect identified. | None | Run 1 and Run 2 both green |
| 9. Repository Hygiene | Reviewed for debug artifacts, temp files, secrets, commented-out code | Only `console.log` is server startup message (intentional). `data/csms.sqlite` is gitignored and untracked. No secrets, no temp files, no commented-out code. No defect identified. | None | Reviewed - no defect identified |

No production code changes were required. The codebase was already well-hardened from T01-T14. T15 work consisted of the audit, the five new hardening tests, and this release-readiness document.

---

## 4. Five New T15 Hardening Tests

### Test 1: Malformed Route Identifier Handling

| Field | Value |
|---|---|
| Test Name | Hardening Test 1 - Malformed route identifier /residents/abc/edit returns controlled 404 without crashing |
| Category | 1 - Invalid or Malformed Input |
| What It Verifies | Navigating to `/residents/abc/edit` with a non-numeric ID returns HTTP 404 (not 500), does not expose a stack trace or SQL error, and does not create or modify any persisted record. |
| Why It Adds Value | No existing T01-T14 test covers malformed route identifiers. T12 Test 11 covers nonexistent numeric IDs, but not non-numeric strings that produce `NaN`. This test proves the `Number()` parsing + `findById(null)` + 404 render chain works safely at the boundary. |

### Test 2: Rejected Mutation Protects Persistence

| Field | Value |
|---|---|
| Test Name | Hardening Test 2 - Invalid SR transition (Pending→Completed) leaves persisted record completely unchanged |
| Category | 2 - Rejected Mutation Protects Persistence |
| What It Verifies | Attempting an invalid SR status transition (Pending → Completed directly) is rejected by `ServiceRequestStatusService`, and afterward every field of the persisted record (id, residentId, serviceType, description, dateRequested, status) is retrieved and verified unchanged. Also verifies no phantom records were created. |
| Why It Adds Value | T10 tests verify that invalid transitions return `invalidTransition: true`, but they do not retrieve the full record afterward and verify every individual field. This test proves atomicity — the rejected operation left zero side effects in persistence. |

### Test 3: Read-Only Request Safety

| Field | Value |
|---|---|
| Test Name | Hardening Test 3 - Repeated GET requests (dashboard, residents, service-requests, details) do not modify persistence |
| Category | 3 - Read-Only Request Safety |
| What It Verifies | After seeding 2 residents (1 Active, 1 Inactive) and 2 service requests (1 Pending, 1 Completed), performs 10 GET requests across dashboard, resident listing, resident search, resident edit form, SR listing, SR status filter, SR details (two different IDs), and SR submission form. Then re-queries repositories to verify counts, individual record fields, and the Inactive resident's status are all unchanged. |
| Why It Adds Value | T14 Test 15 and T12 Test 14 check GET safety for individual endpoints. This test is broader — it hits every GET endpoint in the application in one test and verifies the Inactive resident was not reactivated, no records were created, and no records were modified. It covers the full read-only surface area. |

### Test 4: Cross-Feature Regression

| Field | Value |
|---|---|
| Test Name | Hardening Test 4 - Deactivation reflected in dashboard AND blocks future SR submission (T07+T09+T14 cross-feature) |
| Category | 4 - Cross-Feature Regression |
| What It Verifies | Seeds 2 Active residents. Deactivates one via `ResidentDeactivationService` (T07). Verifies dashboard counts update: Active 2→1, Inactive 0→1, Total unchanged (T14). Then attempts SR submission for the deactivated resident via `ServiceRequestSubmissionService` (T09) — verifies it is rejected with `residentInactive: true` and no SR is persisted. Also verifies the still-Active resident can still submit successfully. |
| Why It Adds Value | T14 Test 9 checks deactivation → dashboard. T09 tests check inactive → submission blocked. No existing test chains all three together in a single scenario. This test proves T07, T09, and T14 integrate correctly — deactivation simultaneously affects dashboard reporting AND future transaction eligibility. |

### Test 5: Repeatability / Boundary Behavior

| Field | Value |
|---|---|
| Test Name | Hardening Test 5 - Repeated deactivation of already-Inactive Resident is safe and idempotent |
| Category | 5 - Repeatability or Boundary Behavior |
| What It Verifies | Deactivates an Active resident, then deactivates the same resident two more times. Each time verifies: the result is `success: true` with `alreadyInactive: true` (not an error), the resident remains persisted (not deleted), the status remains Inactive, all personal data is unchanged, the total count stays at 1, and the resident remains searchable by name. |
| Why It Adds Value | T07 tests verify single deactivation and already-inactive handling, but no existing test performs three consecutive deactivation attempts and verifies idempotency at the boundary. This test proves repeated deactivation is safe — no errors, no deletions, no data loss, and the record remains searchable. |

---

## 5. Full Regression Test Results

| Field | Value |
|---|---|
| Test command | `node --test` |
| Run 1 result | 164 tests, 0 failures, 0 skipped |
| Run 2 result | 164 tests, 0 failures, 0 skipped |
| Total passing tests | 164 (159 existing Starter-T14 + 5 T15 hardening) |

Both runs were executed consecutively with no changes between them. Both produced identical results, confirming no test-order dependency, no leftover persistence, and no resource leaks.

---

## 6. Manual Release Verification

| Verification | Result | Notes |
|---|---|---|
| Application starts | PASS | `npm start` launches Express on port 3000 |
| /health works | PASS | Returns JSON `{ status: "ok", ... }` |
| Dashboard loads | PASS | All stat cards and recent requests table render |
| Resident listing/search works | PASS | `/residents` loads, search filters by name |
| Valid Resident registration works | PASS | New resident persists with Active status and generated ID |
| Invalid Resident registration is rejected | PASS | Validation errors shown, no record persisted |
| Resident update works | PASS | Permitted fields update, ID and status preserved |
| Resident deactivation works and record remains visible | PASS | Status → Inactive, record remains in listing and search |
| Valid Service Request submission for Active Resident works | PASS | New SR persists as Pending with generated ID |
| Missing/Inactive Resident submission is rejected | PASS | residentNotFound and residentInactive errors shown, no SR persisted |
| Service Request search/filter/details work | PASS | Text search, status filter, combined, and details page all functional |
| Valid Service Request workflow works | PASS | Pending → In Progress → Completed transitions correctly |
| Invalid/terminal transition is rejected | PASS | Pending → Completed rejected, terminal states locked |
| Dashboard reflects Resident/Service Request changes | PASS | Deactivation and SR transitions reflected after refresh |
| Read-only GET operations do not modify persistence | PASS | Repeated page loads do not change any data |

---

## 7. Repository Hygiene Review

| Item | Reviewed | Finding |
|---|---|---|
| Debug output (console.log) | Yes | Only instance is server startup message in `src/server.js` — intentional, not a debug artifact |
| Temporary files | Yes | No temp files found in repository. Temporary test script created during audit was deleted. |
| Generated build/runtime artifacts | Yes | No build step in this project. `node_modules/` is gitignored. No generated output files. |
| Accidental local database files | Yes | `data/csms.sqlite` exists locally but is gitignored and not tracked by git. Verified with `git ls-files data/` returning empty. |
| Commented-out abandoned code | Yes | No commented-out code blocks found in any source file |
| Secrets/credentials | Yes | No `.env` files, no API keys, no tokens, no passwords in any tracked file. `.gitignore` excludes `.env` files. |
| Broken navigation/links | Yes | All nav links (Dashboard, Residents, Service Requests) verified across all 7 views. No broken links. |
| Direct SQL parameter binding | Yes | All repository methods use `prepare().get()`, `prepare().all()`, `prepare().run()` with `?` parameter binding. No string concatenation in SQL. |

No cleanup was required. The repository was already clean.

---

## 8. Known Limitations

No known release-blocking limitations identified within the defined CSMS scope.

The following are out of scope per T01-T15 requirements and are not considered limitations:
- Authentication, authorization, user accounts (explicitly out of scope)
- Resident reactivation (explicitly out of scope — Inactive is terminal)
- Physical deletion of records (explicitly out of scope — deactivation is soft)
- Pagination (explicitly out of scope)
- Export functionality (explicitly out of scope)
- Notifications, audit history, status history (explicitly out of scope)
- Date-range filtering on dashboard (explicitly out of scope)

---

## 9. Release Candidate Statement

**READY FOR T16 FINAL EXAM**

The CSMS has been reviewed across all nine hardening areas. All 164 automated tests pass on two consecutive runs. All 12 manual verification scenarios are backed by automated test coverage. No release-blocking defect remains. The repository is clean. The system is ready for the Final Examination.
