/**
 * T16 - Final Examination Tests
 *
 * This file contains two tests required by the Final Examination:
 *
 *   Test 1 (Final Examination Integration Test):
 *     Verifies that resident registration, service request submission,
 *     the full service request workflow (Pending → In Progress → Completed
 *     and Pending → Cancelled), and dashboard aggregation all integrate
 *     correctly end-to-end with real SQLite persistence.
 *
 *     Modules/responsibilities crossed:
 *       - T04 ResidentRegistrationService (resident registration)
 *       - T09 ServiceRequestSubmissionService (SR submission with eligibility)
 *       - T10 ServiceRequestStatusService (controlled workflow transitions)
 *       - T14 DashboardService (aggregate metric reporting)
 *       - T03 ResidentRepository + ServiceRequestRepository (real persistence)
 *
 *   Test 2 (Release Version Verification):
 *     Verifies that the /health endpoint correctly identifies the application
 *     as CSMS version 1.0.0 with a healthy status — automated proof that the
 *     final release identity is correctly reported by the running application.
 *
 * Both tests use isolated temporary SQLite databases (crypto.randomUUID()
 * pattern) so they never share state with each other or with other test files.
 */

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import request from "supertest";

import { createApp } from "../src/app.js";
import { Resident } from "../src/models/Resident.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ResidentRegistrationService } from "../src/services/ResidentRegistrationService.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import { ServiceRequestSubmissionService } from "../src/services/ServiceRequestSubmissionService.js";
import { ServiceRequestStatusService } from "../src/services/ServiceRequestStatusService.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import { DashboardService } from "../src/services/DashboardService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t16-${crypto.randomUUID()}.sqlite`);
}

function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}

function makeValidResident(overrides = {}) {
  return new Resident({
    firstName: "Maria",
    lastName: "Santos",
    address: "123 Barangay Uno",
    contactNumber: "09171234567",
    email: "maria@example.com",
    status: Resident.Status.ACTIVE,
    ...overrides
  });
}

function makeValidServiceRequest(residentId, overrides = {}) {
  return new ServiceRequest({
    id: null,
    residentId,
    serviceType: "Barangay Clearance",
    description: "Requesting clearance for employment purposes.",
    dateRequested: "2026-11-01",
    status: ServiceRequest.Status.PENDING,
    ...overrides
  });
}

// ---------------------------------------------------------------------------
// Test 1 — Final Examination Integration Test
//
// Scenario: Register two residents, submit three service requests, run each
// through workflow transitions, then verify that the final dashboard
// aggregation and every persisted record reflect the correct end state.
//
// This crosses T04, T09, T10, T14, and T03 — four responsibilities plus the
// persistence layer — using a real SQLite database throughout.
// ---------------------------------------------------------------------------

test("resident registration and complete service request lifecycle persists correctly through submission, workflow transitions, and dashboard aggregation", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository    = new ResidentRepository(databasePath);
  const srRepository          = new ServiceRequestRepository(databasePath);

  try {
    // --- Step 1: Register two residents via ResidentRegistrationService (T04) ---
    const residentValidator      = new ResidentValidator();
    const registrationService    = new ResidentRegistrationService(residentValidator, residentRepository);

    const result1 = registrationService.registerResident(
      makeValidResident({ email: "resident1@example.com" })
    );
    const result2 = registrationService.registerResident(
      makeValidResident({ firstName: "Jose", lastName: "Reyes", email: "resident2@example.com" })
    );

    assert.equal(result1.success, true, "Resident 1 registration must succeed");
    assert.equal(result2.success, true, "Resident 2 registration must succeed");

    const resident1 = result1.resident;
    const resident2 = result2.resident;

    // Verify both are persisted as Active
    assert.equal(residentRepository.countAll(), 2);
    assert.equal(residentRepository.findById(resident1.id).status, Resident.Status.ACTIVE);
    assert.equal(residentRepository.findById(resident2.id).status, Resident.Status.ACTIVE);

    // --- Step 2: Submit three service requests via ServiceRequestSubmissionService (T09) ---
    const srValidator       = new ServiceRequestValidator();
    const submissionService = new ServiceRequestSubmissionService(
      srValidator,
      srRepository,
      residentRepository
    );

    // Two SRs for Resident 1, one SR for Resident 2
    const submit1 = submissionService.submitServiceRequest(
      makeValidServiceRequest(resident1.id, { serviceType: "Barangay Clearance" })
    );
    const submit2 = submissionService.submitServiceRequest(
      makeValidServiceRequest(resident1.id, { serviceType: "Indigency Certificate" })
    );
    const submit3 = submissionService.submitServiceRequest(
      makeValidServiceRequest(resident2.id, { serviceType: "Business Permit Endorsement" })
    );

    assert.equal(submit1.success, true, "SR 1 submission must succeed");
    assert.equal(submit2.success, true, "SR 2 submission must succeed");
    assert.equal(submit3.success, true, "SR 3 submission must succeed");

    const sr1 = submit1.serviceRequest;
    const sr2 = submit2.serviceRequest;
    const sr3 = submit3.serviceRequest;

    // Verify 3 SRs persisted, all Pending
    assert.equal(srRepository.countAll(), 3);
    assert.equal(srRepository.findById(sr1.id).status, ServiceRequest.Status.PENDING);
    assert.equal(srRepository.findById(sr2.id).status, ServiceRequest.Status.PENDING);
    assert.equal(srRepository.findById(sr3.id).status, ServiceRequest.Status.PENDING);

    // Verify initial dashboard state: 2 Active residents, 3 Pending SRs
    const dashboardService = new DashboardService(residentRepository, srRepository);
    const initialSummary   = dashboardService.getDashboardSummary();

    assert.equal(initialSummary.residents.total,    2);
    assert.equal(initialSummary.residents.active,   2);
    assert.equal(initialSummary.residents.inactive, 0);
    assert.equal(initialSummary.serviceRequests.total,    3);
    assert.equal(initialSummary.serviceRequests.pending,  3);
    assert.equal(initialSummary.serviceRequests.open,     3);

    // --- Step 3: Advance SR 1 through the full workflow via ServiceRequestStatusService (T10) ---
    // Pending → In Progress → Completed
    const statusService = new ServiceRequestStatusService(srRepository);

    const toInProgress = statusService.manageStatus(sr1.id, ServiceRequest.Status.IN_PROGRESS);
    assert.equal(toInProgress.success, true, "SR 1 must transition Pending → In Progress");
    assert.equal(toInProgress.serviceRequest.status, ServiceRequest.Status.IN_PROGRESS);

    const toCompleted = statusService.manageStatus(sr1.id, ServiceRequest.Status.COMPLETED);
    assert.equal(toCompleted.success, true, "SR 1 must transition In Progress → Completed");
    assert.equal(toCompleted.serviceRequest.status, ServiceRequest.Status.COMPLETED);

    // --- Step 4: Cancel SR 3 via ServiceRequestStatusService (T10) ---
    // Pending → Cancelled
    const toCancelled = statusService.manageStatus(sr3.id, ServiceRequest.Status.CANCELLED);
    assert.equal(toCancelled.success, true, "SR 3 must transition Pending → Cancelled");
    assert.equal(toCancelled.serviceRequest.status, ServiceRequest.Status.CANCELLED);

    // SR 2 remains Pending (never transitioned)

    // --- Step 5: Verify final persisted state via repositories (T03) ---
    const finalSr1 = srRepository.findById(sr1.id);
    const finalSr2 = srRepository.findById(sr2.id);
    const finalSr3 = srRepository.findById(sr3.id);

    assert.equal(finalSr1.status, ServiceRequest.Status.COMPLETED,  "SR 1 must be Completed in persistence");
    assert.equal(finalSr2.status, ServiceRequest.Status.PENDING,    "SR 2 must remain Pending in persistence");
    assert.equal(finalSr3.status, ServiceRequest.Status.CANCELLED,  "SR 3 must be Cancelled in persistence");

    // Resident IDs must still be correctly associated after transitions
    assert.equal(finalSr1.residentId, resident1.id);
    assert.equal(finalSr2.residentId, resident1.id);
    assert.equal(finalSr3.residentId, resident2.id);

    // Total SR count must be exactly 3 (no phantom records)
    assert.equal(srRepository.countAll(), 3);

    // --- Step 6: Verify final dashboard aggregation (T14) ---
    const finalSummary = dashboardService.getDashboardSummary();

    assert.equal(finalSummary.residents.total,    2, "Dashboard must report 2 total residents");
    assert.equal(finalSummary.residents.active,   2, "Dashboard must report 2 active residents");
    assert.equal(finalSummary.residents.inactive, 0, "Dashboard must report 0 inactive residents");

    assert.equal(finalSummary.serviceRequests.total,      3, "Dashboard must report 3 total SRs");
    assert.equal(finalSummary.serviceRequests.pending,    1, "Dashboard must report 1 Pending SR");
    assert.equal(finalSummary.serviceRequests.inProgress, 0, "Dashboard must report 0 In Progress SRs");
    assert.equal(finalSummary.serviceRequests.completed,  1, "Dashboard must report 1 Completed SR");
    assert.equal(finalSummary.serviceRequests.cancelled,  1, "Dashboard must report 1 Cancelled SR");
    assert.equal(finalSummary.serviceRequests.open,       1, "Dashboard must report 1 open SR (Pending only)");

  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 2 — Release Version Verification (Part G)
//
// Verifies that the /health endpoint reports the final release identity:
//   - application: "Community Services Management System"
//   - version:     "1.0.0"
//   - status:      "ok"
//
// This is automated proof that the running application correctly identifies
// itself as CSMS v1.0.0. If the version in src/config/application.js ever
// changes, this test will catch the inconsistency immediately.
// ---------------------------------------------------------------------------

test("health endpoint reports application identity and version 1.0.0 for release verification", async () => {
  const app = createApp();

  const response = await request(app).get("/health");

  assert.equal(response.statusCode, 200, "/health must return HTTP 200");

  assert.deepEqual(response.body, {
    status: "ok",
    application: "Community Services Management System",
    version: "1.0.0"
  }, "/health must report CSMS v1.0.0 with ok status");
});
