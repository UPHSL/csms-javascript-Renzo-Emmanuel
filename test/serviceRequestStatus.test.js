import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { Resident } from "../src/models/Resident.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import { ServiceRequestSubmissionService } from "../src/services/ServiceRequestSubmissionService.js";
import { ServiceRequestStatusService } from "../src/services/ServiceRequestStatusService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t10-${crypto.randomUUID()}.sqlite`);
}

function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}

/**
 * Build a fully-wired setup using a single shared SQLite file so all
 * repositories operate on the same data.
 */
function createStatusSetup() {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);
  const validator = new ServiceRequestValidator();
  const submissionService = new ServiceRequestSubmissionService(
    validator,
    serviceRequestRepository,
    residentRepository
  );
  const statusService = new ServiceRequestStatusService(serviceRequestRepository);

  return {
    databasePath,
    residentRepository,
    serviceRequestRepository,
    submissionService,
    statusService,
  };
}

function makeActiveResident() {
  return new Resident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active",
  });
}

/**
 * Persist an Active Resident and submit a valid ServiceRequest through T09,
 * returning the persisted ServiceRequest in Pending status.
 */
function submitPendingRequest(setup) {
  const resident = setup.residentRepository.save(makeActiveResident());
  const request = new ServiceRequest({
    residentId: resident.id,
    serviceType: "Document Request",
    description: "Requesting a barangay clearance.",
    dateRequested: "2026-10-01",
    status: "Pending",
  });
  const result = setup.submissionService.submitServiceRequest(request);
  return result.serviceRequest; // persisted, id assigned, status = "Pending"
}

/**
 * Advance a request to "In Progress" via a real T10 transition and return
 * the updated ServiceRequest. Used by tests that need an In Progress starting
 * point without manually constructing a database row.
 */
function advanceToInProgress(setup, pendingRequest) {
  const result = setup.statusService.manageStatus(
    pendingRequest.id,
    "In Progress"
  );
  return result.serviceRequest;
}

// ---------------------------------------------------------------------------
// Test 1 — Pending → In Progress succeeds
// ---------------------------------------------------------------------------

test("Pending service request can move to In Progress", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    const result = setup.statusService.manageStatus(pending.id, "In Progress");

    assert.equal(result.success, true);
    assert.equal(result.notFound, false);
    assert.equal(result.unsupportedStatus, false);
    assert.equal(result.invalidTransition, false);
    assert.ok(result.serviceRequest);
    assert.equal(result.serviceRequest.status, "In Progress");

    // Verify persistence — re-fetch independently
    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "In Progress");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 2 — Pending → Cancelled succeeds
// ---------------------------------------------------------------------------

test("Pending service request can be Cancelled", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    const result = setup.statusService.manageStatus(pending.id, "Cancelled");

    assert.equal(result.success, true);
    assert.equal(result.serviceRequest.status, "Cancelled");

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Cancelled");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 3 — In Progress → Completed succeeds
// ---------------------------------------------------------------------------

test("In Progress service request can move to Completed", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);
    advanceToInProgress(setup, pending);

    const result = setup.statusService.manageStatus(pending.id, "Completed");

    assert.equal(result.success, true);
    assert.equal(result.serviceRequest.status, "Completed");

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Completed");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 4 — In Progress → Cancelled succeeds
// ---------------------------------------------------------------------------

test("In Progress service request can be Cancelled", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);
    advanceToInProgress(setup, pending);

    const result = setup.statusService.manageStatus(pending.id, "Cancelled");

    assert.equal(result.success, true);
    assert.equal(result.serviceRequest.status, "Cancelled");

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Cancelled");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 5 — Pending → Completed fails, status stays Pending
// ---------------------------------------------------------------------------

test("Pending service request cannot move directly to Completed", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    const result = setup.statusService.manageStatus(pending.id, "Completed");

    assert.equal(result.success, false);
    assert.equal(result.invalidTransition, true);
    assert.equal(result.serviceRequest, null);

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Pending");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 6 — In Progress → Pending fails, status stays In Progress
// ---------------------------------------------------------------------------

test("In Progress service request cannot return to Pending", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);
    advanceToInProgress(setup, pending);

    const result = setup.statusService.manageStatus(pending.id, "Pending");

    assert.equal(result.success, false);
    assert.equal(result.invalidTransition, true);
    assert.equal(result.serviceRequest, null);

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "In Progress");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 7 — Completed is terminal
// ---------------------------------------------------------------------------

test("Completed service request cannot transition to any other status", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);
    advanceToInProgress(setup, pending);
    setup.statusService.manageStatus(pending.id, "Completed");

    // Attempt to move away from Completed
    const result = setup.statusService.manageStatus(pending.id, "In Progress");

    assert.equal(result.success, false);
    assert.equal(result.invalidTransition, true);
    assert.equal(result.serviceRequest, null);

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Completed");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 8 — Cancelled is terminal
// ---------------------------------------------------------------------------

test("Cancelled service request cannot transition to any other status", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);
    setup.statusService.manageStatus(pending.id, "Cancelled");

    // Attempt to move away from Cancelled
    const result = setup.statusService.manageStatus(pending.id, "Pending");

    assert.equal(result.success, false);
    assert.equal(result.invalidTransition, true);
    assert.equal(result.serviceRequest, null);

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Cancelled");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 9 — Unsupported status value is rejected
// ---------------------------------------------------------------------------

test("Unsupported status value is rejected and persistence is unchanged", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    const result = setup.statusService.manageStatus(pending.id, "Approved");

    assert.equal(result.success, false);
    assert.equal(result.unsupportedStatus, true);
    assert.equal(result.invalidTransition, false);
    assert.equal(result.serviceRequest, null);

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Pending");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 10 — Nonexistent service request is handled safely
// ---------------------------------------------------------------------------

test("Nonexistent service request ID returns notFound and creates no record", () => {
  const setup = createStatusSetup();
  try {
    const result = setup.statusService.manageStatus(999999, "In Progress");

    assert.equal(result.success, false);
    assert.equal(result.notFound, true);
    assert.equal(result.unsupportedStatus, false);
    assert.equal(result.invalidTransition, false);
    assert.equal(result.serviceRequest, null);

    // Confirm nothing was created
    const notCreated = setup.serviceRequestRepository.findById(999999);
    assert.equal(notCreated, null);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 11 — Successful transition preserves all non-status fields
// ---------------------------------------------------------------------------

test("Successful transition preserves id, residentId, serviceType, description, and dateRequested", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    const result = setup.statusService.manageStatus(pending.id, "In Progress");

    assert.equal(result.success, true);
    assert.ok(result.serviceRequest);

    const updated = result.serviceRequest;
    assert.equal(updated.id, pending.id);
    assert.equal(updated.residentId, pending.residentId);
    assert.equal(updated.serviceType, pending.serviceType);
    assert.equal(updated.description, pending.description);
    assert.equal(updated.dateRequested, pending.dateRequested);
    // Only status should differ
    assert.equal(updated.status, "In Progress");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 12 — Invalid transition does not modify persistence
// ---------------------------------------------------------------------------

test("Invalid transition does not modify the persisted service request", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    // Attempt invalid transition Pending → Completed
    setup.statusService.manageStatus(pending.id, "Completed");

    // Re-fetch and verify everything is unchanged
    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Pending");
    assert.equal(stored.id, pending.id);
    assert.equal(stored.residentId, pending.residentId);
    assert.equal(stored.serviceType, pending.serviceType);
    assert.equal(stored.description, pending.description);
    assert.equal(stored.dateRequested, pending.dateRequested);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 13 — Same-status request is rejected
// ---------------------------------------------------------------------------

test("Same-status request is rejected as an invalid transition", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    // Pending → Pending
    const result = setup.statusService.manageStatus(pending.id, "Pending");

    assert.equal(result.success, false);
    assert.equal(result.invalidTransition, true);
    assert.equal(result.unsupportedStatus, false);
    assert.equal(result.serviceRequest, null);

    const stored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(stored.status, "Pending");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 14 — Student-designed: sequential valid transitions Pending → In Progress → Completed
// Verifies that each step is actually persisted before the next transition
// is attempted, proving the full lifecycle works end-to-end.
// ---------------------------------------------------------------------------

test("Sequential valid transitions Pending to In Progress to Completed each persist correctly", () => {
  const setup = createStatusSetup();
  try {
    const pending = submitPendingRequest(setup);

    // Step A: Pending → In Progress
    const stepA = setup.statusService.manageStatus(pending.id, "In Progress");
    assert.equal(stepA.success, true);
    assert.equal(stepA.serviceRequest.status, "In Progress");

    // Verify Step A is in the database before proceeding
    const afterA = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(afterA.status, "In Progress");

    // Step B: In Progress → Completed
    const stepB = setup.statusService.manageStatus(pending.id, "Completed");
    assert.equal(stepB.success, true);
    assert.equal(stepB.serviceRequest.status, "Completed");

    // Verify Step B is in the database
    const afterB = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(afterB.status, "Completed");

    // Confirm Completed is now terminal — any further attempt must fail
    const stepC = setup.statusService.manageStatus(pending.id, "Cancelled");
    assert.equal(stepC.success, false);
    assert.equal(stepC.invalidTransition, true);

    // Final database state must still be Completed
    const finalStored = setup.serviceRequestRepository.findById(pending.id);
    assert.equal(finalStored.status, "Completed");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});
