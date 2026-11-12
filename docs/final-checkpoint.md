# T16 - Final Development Checkpoint

---

## 1. Developer Information

| Field | Value |
|---|---|
| Name | Renzo Emmanuel V. Ramos |
| GitHub Username | Renzo-Emmanuel |
| Technology Stack | JavaScript with Express.js (Node.js 24, EJS, node:sqlite) |
| T16 Branch | feature/t16-final-release |
| Final Release Version | 1.0.0 |

---

## 2. My Final Release Implementation

The authoritative application version is defined in `src/config/application.js` inside the `applicationConfig` object, which was already the established single source of truth for application identity since the starter sprint. Placing the version there is the correct architectural decision because all other components that need to identify the application — the health controller, the home controller, and now the presentation layer — already read from that one object. Changing the version from `0.1.0` to `1.0.0` in that one file is all that is required; every consumer updates automatically.

The `/health` endpoint obtains the version by importing `applicationConfig` directly from `src/config/application.js` and reading `applicationConfig.version` — a pattern already in place since the starter. No change was needed to the health controller's structure; only the value in the config file changed.

The browser interface obtains the version through Express's `app.locals` mechanism. Inside `createApp()` in `src/app.js`, the line `app.locals.appVersion = applicationConfig.version` makes the version available as a template variable in every EJS view rendered by the application, without any controller needing to pass it explicitly. Each of the seven views renders the version in a consistent `<footer class="app-footer">` element using `<%= appVersion %>`.

Inconsistent version values are avoided by design: the views never hardcode a version string — they always reference `appVersion` from `app.locals`, which itself comes from `applicationConfig.version`. There is exactly one place to update the version, and every surface of the application reflects it immediately. This follows the standard Express/Node.js convention of using `app.locals` for application-wide template data, keeping presentation concerns out of business-logic controllers.

---

## 3. Files I Changed

| File | Purpose |
|---|---|
| `src/config/application.js` | Updated `version` from `"0.1.0"` to `"1.0.0"` and `currentSprint` to `"Sprint 6 - Final Release"`. This is the single source of truth for the release identity. Added `shortName: "CSMS"` for completeness. |
| `src/app.js` | Imported `applicationConfig` and added `app.locals.appVersion = applicationConfig.version` so the version is injected into every EJS view automatically. |
| `src/views/dashboard/index.ejs` | Added `<footer class="app-footer">` displaying `v<%= appVersion %>` before `</body>`. |
| `src/views/residents/index.ejs` | Added `<footer class="app-footer">` displaying `v<%= appVersion %>` before `</body>`. |
| `src/views/residents/new.ejs` | Added `<footer class="app-footer">` displaying `v<%= appVersion %>` before `</body>`. |
| `src/views/residents/edit.ejs` | Added `<footer class="app-footer">` displaying `v<%= appVersion %>` before `</body>`. |
| `src/views/service-requests/index.ejs` | Added `<footer class="app-footer">` displaying `v<%= appVersion %>` before `</body>`. |
| `src/views/service-requests/show.ejs` | Added `<footer class="app-footer">` displaying `v<%= appVersion %>` before `</body>`. |
| `src/views/service-requests/new.ejs` | Added `<footer class="app-footer">` displaying `v<%= appVersion %>` before `</body>`. |
| `public/css/style.css` | Added `.app-footer` CSS rule using existing design tokens (`--text-muted`, `--border-soft`) to style the footer consistently with the existing design system. |
| `test/application.test.js` | Updated the home page test to expect `Sprint 6 - Final Release` and version `/1\.0\.0/`. Updated the health endpoint test to expect `version: "1.0.0"`. These are legitimate release-version verification tests — not weakened, just updated to the correct expected value. |
| `test/final.test.js` | New file containing the Final Examination integration test and the release-version verification test. |
| `docs/release-v1.0.0.md` | Official CSMS v1.0.0 release notes. |
| `docs/final-checkpoint.md` | This document. |

---

## 4. My Final Examination Test

| Field | Value |
|---|---|
| Test Name | `resident registration and complete service request lifecycle persists correctly through submission, workflow transitions, and dashboard aggregation` |
| Modules/Responsibilities Covered | T04 ResidentRegistrationService, T09 ServiceRequestSubmissionService, T10 ServiceRequestStatusService, T14 DashboardService, T03 ResidentRepository + ServiceRequestRepository (real SQLite persistence) |
| Starting State | Empty isolated SQLite database (temporary file, `crypto.randomUUID()` naming) |
| Operations Performed | 1. Register 2 residents via `ResidentRegistrationService` — verify both Active in persistence. 2. Submit 3 service requests (2 for Resident 1, 1 for Resident 2) via `ServiceRequestSubmissionService` — verify all Pending. 3. Verify initial dashboard: 2 active residents, 3 pending SRs, open=3. 4. Advance SR 1: Pending → In Progress → Completed via `ServiceRequestStatusService`. 5. Cancel SR 3: Pending → Cancelled. 6. SR 2 left as Pending (control — untouched). |
| Expected Final State | SR 1: Completed. SR 2: Pending. SR 3: Cancelled. Total SRs: 3 (no phantom records). Dashboard: residents total=2, active=2, inactive=0; SRs total=3, pending=1, inProgress=0, completed=1, cancelled=1, open=1. All resident IDs correctly associated after transitions. |
| Why This Test Is Meaningful | A unit test for any single service only proves that one component works in isolation. This test proves that four independently developed modules produce the correct combined result when used together on real data. It verifies that a workflow operation (SR status transition) is reflected correctly in a reporting aggregate (dashboard) — a cross-layer behavior that individual unit tests cannot reveal. It also verifies that partially-completed work (SR 2 stays Pending) is not affected by adjacent operations, confirming the independence of records in persistence. |

---

## 5. My Final Technical Decision

**Decision:** Use `app.locals.appVersion` to propagate the release version to all EJS views, rather than passing it explicitly through each controller.

**Alternative Considered:** The alternative was to add `appVersion: applicationConfig.version` to the render call in every controller that renders an EJS view. This is the same pattern used for passing `residents`, `serviceRequests`, `formData`, and similar view-specific data. It would have worked correctly and been familiar to anyone reading the controllers.

**Reason for My Decision:** The release version is not view-specific data — it is application-wide identity information that belongs to every rendered page equally. If I passed it through each controller, I would need to modify six controllers (dashboard, home, resident, service request, and the 404 middleware) and remember to include it every time a new controller renders any view. That approach contradicts the single-source-of-truth principle: the value would still come from one config file, but the wiring would be scattered across six places. Express's `app.locals` is designed exactly for this pattern — values set there are available in every template automatically, without any controller involvement. It is the idiomatic Express solution, it requires changing only `app.js`, and it means no controller needs to be touched just to display a version label.

---

## 6. Problem or Verification Issue Encountered

**Problem:** During T16 development, I needed to verify that none of the seven EJS views would inadvertently hardcode the version string `"1.0.0"` as a literal — which would defeat the single-source-of-truth design and cause the views to silently drift out of sync if the version changed in `application.js`.

**Cause or Investigation:** The risk was that during the footer addition, copy-paste or habit could result in writing `v1.0.0` as a static string rather than `v<%= appVersion %>`. After completing all seven view edits, I performed a targeted search across all EJS files for the literal string `1.0.0` to confirm it did not appear as hardcoded text in any view.

**Resolution:** The search confirmed that `1.0.0` does not appear as a literal string in any view file. All seven footers correctly use `<%= appVersion %>`, which reads from `app.locals.appVersion`, which reads from `applicationConfig.version` in `src/config/application.js`. The single-source-of-truth design is intact and verifiable.

---

## 7. Final Regression Results

| Field | Value |
|---|---|
| Test Command | `node --test` |
| Final Regression Run 1 | 166 tests, 0 failures, 0 skipped |
| Final Regression Run 2 | 166 tests, 0 failures, 0 skipped |
| Total Passing Tests Reported | 166 |

Both runs were executed consecutively with no changes between them. Both produced identical results, confirming no test-order dependency, no leftover persistence between tests, and no resource leaks.

Previous test count (T15 baseline): 164 tests.
T16 additions: 2 new tests (1 Final Examination integration test + 1 release-version verification test).
Final total: 166 tests.

---

## 8. Tools and References Used

| Tool / Reference | How It Was Used |
|---|---|
| Node.js Documentation (nodejs.org) | Referenced `app.locals` behavior in Express, `node:test` test runner API, and `node:crypto` for UUID generation in test isolation |
| Express.js Documentation (expressjs.com) | Confirmed `app.locals` as the idiomatic mechanism for application-wide template data |
| Existing CSMS repository documentation | Used `docs/t15-release-readiness.md`, `docs/prelim-checkpoint.md`, and `docs/midterm-checkpoint.md` as structural references for checkpoint documents |
| Git / GitHub documentation | Referenced annotated tag creation (`git tag -a`) and GitHub Release workflow |
| Kiro AI coding assistant | Used to assist with implementation, test writing, and document drafting. All implementation was reviewed, understood, and verified through the automated test suite and manual acceptance testing. The developer remains responsible for all submitted work. |

---

## 9. Final Release Declaration

**CSMS v1.0.0 - READY FOR RELEASE**
