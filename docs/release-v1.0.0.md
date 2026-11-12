# CSMS v1.0.0 Release Notes

---

## 1. Release

| Field | Value |
|---|---|
| Application | Community Services Management System |
| Short Name | CSMS |
| Release | v1.0.0 |
| Release Type | Final Course Release |
| Release Date | November 2026 |
| Technology Stack | JavaScript with Express.js (Node.js 24, EJS, node:sqlite) |

---

## 2. Release Summary

CSMS v1.0.0 is the final production release of the Community Services Management System, a web application designed for community staff to manage resident records and community service requests end-to-end. The system allows staff to register and maintain resident information, submit and track service requests on behalf of residents, manage service request lifecycle from initial submission through completion or cancellation, and monitor overall community activity through an operational dashboard. CSMS v1.0.0 is fully functional, regression-safe, and ready for production use within its defined scope.

---

## 3. Resident Management Capabilities

CSMS v1.0.0 provides complete resident lifecycle management:

- **Domain Model (T01):** The `Resident` domain model encapsulates all resident information — first name, last name, address, contact number, email, and status — with clearly defined supported status values (`Active`, `Inactive`).
- **Validation (T02):** The `ResidentValidator` enforces all field-level business rules: required fields (first name, last name, address), contact number format (`09XXXXXXXXX`), valid email format, and supported status values. Whitespace-only values are rejected.
- **Persistence (T03):** The `ResidentRepository` provides parameterized SQLite persistence for all create and read operations. All SQL uses prepared statements with `?` parameter binding — no string concatenation. Residents persist across repository instances.
- **Registration (T04):** `ResidentRegistrationService` orchestrates validation and persistence. Valid residents are saved as Active. Invalid submissions are rejected with specific field-level error codes — no record is persisted on failure.
- **Search and Listing (T05):** Residents can be listed (ordered by last name, first name, then ID) or searched by partial case-insensitive name match. Active and Inactive residents are both included in results.
- **Update (T06):** `ResidentUpdateService` allows permitted fields (name, address, contact, email) to be updated while preserving resident ID and status. Invalid updates are rejected without modifying the persisted record.
- **Deactivation (T07):** `ResidentDeactivationService` transitions a resident from Active to Inactive. Inactive is a terminal, non-reversible state. Deactivation is idempotent — attempting to deactivate an already-Inactive resident returns a safe `alreadyInactive` result without error or data loss.
- **Management Interface (T12):** A browser-based resident management interface provides listing, search, registration form, edit form, and deactivation confirmation — all with validation feedback and POST/Redirect/GET pattern throughout.

---

## 4. Service Request Management Capabilities

CSMS v1.0.0 provides complete service request management with a controlled workflow:

- **Domain Model (T08):** The `ServiceRequest` domain model encapsulates request information — resident ID, service type, description, date requested, and status — with clearly defined supported status values (`Pending`, `In Progress`, `Completed`, `Cancelled`).
- **Submission and Validation (T09):** `ServiceRequestSubmissionService` orchestrates intrinsic field validation, resident existence check, resident Active-status eligibility check, and persistence. Submissions for nonexistent or Inactive residents are rejected — no SR is persisted on failure.
- **Workflow Management (T10):** `ServiceRequestStatusService` enforces a strict, controlled transition workflow:
  - `Pending` → `In Progress` or `Cancelled`
  - `In Progress` → `Completed` or `Cancelled`
  - `Completed` and `Cancelled` are terminal states — no further transitions are permitted
  - Invalid transitions (including same-status requests and terminal-state attempts) are rejected before any database write occurs
- **Search and Query (T11):** Service requests can be listed (most recent first by date then ID), searched by partial case-insensitive text match against service type or description, filtered by status, or combined (text + status). All four lifecycle statuses are supported in results.
- **Management Interface (T13):** A browser-based service request management interface provides listing with inline workflow action buttons, submission form with resident eligibility feedback, detail view with status-appropriate action controls, search, and status filtering.

---

## 5. Dashboard Capabilities

CSMS v1.0.0 provides an operational dashboard (T14) that gives staff an at-a-glance view of system activity:

- **Resident Metrics:** Total resident count, Active count, and Inactive count — all computed at the database level using `COUNT(*)` aggregate queries.
- **Service Request Metrics:** Total SR count plus individual counts by status (Pending, In Progress, Completed, Cancelled). An `open` count (Pending + In Progress) indicates workload requiring attention.
- **Recent Service Requests:** A table of the five most recent service requests ordered by date requested (descending) then ID (descending), with direct links to individual detail pages.
- **Read-Only Safety:** The dashboard is a pure read operation. Rendering it never creates, updates, or deletes any resident or service request record.
- **Live Synchronization:** Dashboard metrics are computed fresh from the database on each request, so they always reflect the current system state without requiring a manual refresh.

---

## 6. Quality and Hardening

### T15 — System Hardening

Five targeted hardening tests were added during T15 to verify behavior not covered by T01–T14:

1. Malformed route identifiers (e.g. `/residents/abc/edit`) are handled with a controlled 404 — no crash, no stack trace, no persistence change.
2. Rejected mutations (invalid SR status transitions) leave the full persisted record completely unchanged — atomicity verified by retrieving every field after rejection.
3. All GET requests across all endpoints are confirmed read-only — 10 consecutive GET requests across the full surface leave all counts, statuses, and field values unchanged.
4. Resident deactivation is reflected simultaneously in dashboard counts (T14) and blocks future SR submission (T09) — proving T07, T09, and T14 integrate correctly.
5. Repeated deactivation of an already-Inactive resident is safe and idempotent — no error, no deletion, no data loss, record remains searchable.

### T16 — Final Release Verification

- Application release identity established as `1.0.0` via a single authoritative source (`src/config/application.js`).
- `/health` endpoint confirmed to report application name, version 1.0.0, and healthy status without exposing sensitive information.
- Release version `v1.0.0` displayed in the footer of all 7 browser-facing views via `app.locals`.
- Final Examination integration test added, crossing Resident Registration (T04), SR Submission (T09), SR Workflow (T10), and Dashboard Aggregation (T14) with real SQLite persistence.
- Automated release-version verification added in `test/final.test.js`.
- Full regression suite executed twice consecutively — both runs: 166 tests, 0 failures.

---

## 7. Final Verification

| Verification Item | Result |
|---|---|
| Final Regression Run 1 | PASS — 166 tests, 0 failures, 0 skipped |
| Final Regression Run 2 | PASS — 166 tests, 0 failures, 0 skipped |
| Application Startup | PASS — `npm start` launches Express on port 3000 |
| /health | PASS — Returns `{ status: "ok", application: "Community Services Management System", version: "1.0.0" }` |
| Dashboard | PASS — Loads with all resident metrics, SR metrics, and recent requests table |
| Resident Management | PASS — Listing, search, registration (valid + invalid), update, deactivation all verified |
| Service Request Management | PASS — Submission, eligibility check, listing, search, filter, details, full workflow verified |
| Final Release Version | PASS — `v1.0.0` consistently displayed in footer on all pages and reported by /health |

---

## 8. Known Limitations

No known release-blocking limitations remain within the defined CSMS v1.0.0 scope.

The following capabilities are explicitly out of scope per T01–T16 requirements and are not considered limitations of this release:

- Authentication, authorization, login/logout, user accounts, and user roles
- Resident reactivation (Inactive is a terminal state by design)
- Physical deletion of records (deactivation is the only lifecycle exit)
- Pagination on listing pages
- Export functionality (CSV, PDF, etc.)
- Notifications, email, SMS
- Audit history and status change history
- Dashboard date-range filtering and advanced reporting
- Service request assignment, priority, and attachments
- Mobile application and external API integrations
