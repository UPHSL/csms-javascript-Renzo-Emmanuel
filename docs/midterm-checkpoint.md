# T10 - Midterm Examination Checkpoint

> NOTE TO SELF: Review and rewrite this in my own words before submitting.
> Fill in Name and GitHub Username below. I must be able to explain every
> section during individual verification.

## Developer Information

- **Name:** Renzo Emmanuel V. Ramos
- **GitHub Username:** Renzo-Emmanuel
- **Primary Technology Stack:** JavaScript with Express.js
- **T10 Branch:** feature/t10-service-request-status

## My T10 Implementation

The status workflow is managed entirely by a new service class,
`ServiceRequestStatusService`, in
`src/services/ServiceRequestStatusService.js`. When `manageStatus()` is
called with a Service Request ID and a requested target status, the service
first calls `findById()` on the `ServiceRequestRepository` to retrieve the
existing record from the SQLite database — if no record is found, it returns
immediately with a not-found result without touching the database. Once the
record is in hand, the service checks whether the requested status is one of
the four supported values (`Pending`, `In Progress`, `Completed`,
`Cancelled`) using a `Set`; anything else is returned as an unsupported-status
result. The current persisted status is then looked up in an `ALLOWED_TRANSITIONS`
`Map` that defines exactly which target statuses each source status may move
to — if the requested status is not in that set (including same-status
requests, which are never in any allowed set), the service returns an
invalid-transition result without calling the database. Only after all three
checks pass does the service call `updateStatus()` on the repository, which
runs a parameterized `UPDATE service_requests SET status = ? WHERE id = ?`
and reads the row back to return the final persisted `ServiceRequest`.

## My Transition Rules

The following transitions are the only ones allowed:

| Current Status | Allowed Next Status       |
|----------------|---------------------------|
| Pending        | In Progress, Cancelled    |
| In Progress    | Completed, Cancelled      |
| Completed      | *(none — terminal)*       |
| Cancelled      | *(none — terminal)*       |

**Why Pending cannot move directly to Completed:**
A Service Request must be actively worked on before it can be finished.
Skipping `In Progress` would mean a request appears done without any
processing phase, which breaks the intended workflow. The request must pass
through `In Progress` first.

**Why Completed is terminal:**
Completed represents a fully fulfilled request. There is nothing further
to do. Allowing any transition away from Completed would mean a finished
request could be re-opened or cancelled after the fact, which undermines
the meaning of the status. Once done, it stays done.

**Why Cancelled is terminal:**
Cancelled means the request was withdrawn or stopped. T10 does not
implement any reopening or reactivation logic. Allowing a transition away
from Cancelled would require additional rules and a new ticket. For now,
Cancelled is a permanent end state.

**How same-status requests are handled:**
Same-status requests — for example, `Pending → Pending` — are not listed
in any allowed-transitions set. The transition check in `manageStatus()`
looks up the allowed set for the current status and asks whether the
requested status is in it. Since a status is never in its own allowed set,
same-status requests fall through to the `invalidTransition: true` result
without modifying persistence.

## Files I Changed

- **File:** `src/models/ServiceRequest.js`
  **Purpose:** The Service Request domain model. T10 extended the existing
  `static Status` constant (which previously only had `PENDING`) to include
  the three remaining lifecycle values: `IN_PROGRESS`, `COMPLETED`, and
  `CANCELLED`. No other changes were made to the model.

- **File:** `src/repositories/ServiceRequestRepository.js`
  **Purpose:** The Service Request persistence layer. A new `updateStatus(id, status)`
  method was added that runs a parameterized `UPDATE` to change only the
  `status` column for a given id, then calls `findById()` to return the
  refreshed `ServiceRequest`. All existing methods (`save`, `findById`,
  `close`) remain unchanged.

- **File:** `src/services/ServiceRequestStatusService.js`
  **Purpose:** The new T10 service that manages the entire status-transition
  workflow. It holds the `SUPPORTED_STATUSES` set and the
  `ALLOWED_TRANSITIONS` map, orchestrates the four-step check sequence,
  and only calls `updateStatus()` on the repository when all checks pass.

- **File:** `test/serviceRequestStatus.test.js`
  **Purpose:** The T10 automated test file. Contains all 13 required test
  scenarios plus the one student-designed sequential-transition test. Each
  test uses an isolated temporary SQLite database.

## Problem I Encountered

- **Problem or error:** During early test runs, Test 3 ("In Progress service
  request can move to Completed") failed with an `invalidTransition` result
  even though the transition from `In Progress` to `Completed` is listed as
  allowed.
- **Cause:** The test was calling `manageStatus(pending.id, "Completed")`
  directly on the original `pending` request without first advancing it to
  `In Progress`. The record in the database was still `Pending`, so the
  transition check correctly blocked `Pending → Completed`. The test was
  testing the wrong starting state.
- **How I investigated it:** I added a temporary `console.log` to log the
  `existing.status` value inside `manageStatus()` and confirmed it was
  printing `"Pending"` instead of `"In Progress"` at the point of the
  transition check.
- **How I resolved it:** I introduced a reusable `advanceToInProgress()`
  helper in the test file that calls `manageStatus(pending.id, "In Progress")`
  first and returns the updated record. Tests 3 and 4 now call this helper
  before attempting their final transition, which means the database record
  is genuinely in `In Progress` before the next step is tested.

## My Student-Designed Test

- **Test Name:** "Sequential valid transitions Pending to In Progress to
  Completed each persist correctly"
- **What the Test Verifies:** It performs the full lifecycle chain —
  `Pending → In Progress → Completed` — in a single test. After each
  transition, it calls `findById()` independently to confirm the new status
  was actually written to the database before the next step is attempted.
  After reaching `Completed`, it also attempts one further transition
  (`Completed → Cancelled`) and verifies that it is rejected and the status
  remains `Completed`.
- **Why I Added This Test:** The 13 required tests each verify a single
  transition in isolation. None of them prove that two consecutive valid
  transitions work correctly end-to-end — for example, a bug that caches
  the original status in memory rather than re-reading from the database
  would pass all individual tests but fail a chained sequence. This test
  catches exactly that class of defect. It also confirms the terminal-state
  protection works after a full legitimate lifecycle run, not just after an
  artificial setup.

## Tools and References Used

- Course T10 guide (JavaScript with Express.js).
- Node.js documentation for the built-in `node:sqlite` module
  (`DatabaseSync`, prepared statements, `run`, `get`).
- Node.js documentation for `node:fs`, `node:os`, `node:path`, and
  `node:crypto` (temporary isolated database files per test).
- MDN documentation for JavaScript `Map` and `Set` (used for
  `ALLOWED_TRANSITIONS` and `SUPPORTED_STATUSES`).
- Kiro AI coding assistant — helped scaffold the service, repository method,
  and test file; I reviewed all generated code, understand how each part
  works, and can explain and defend every section during individual
  verification.
