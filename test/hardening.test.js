/**
 * T15 - System Hardening: Five Student-Designed Hardening Tests
 *
 * These tests are intentionally designed to go beyond the T01-T14 test suite.
 * Each test targets one of the five required hardening categories:
 *
 *   Test 1 (Category 1 - Invalid/Malformed Input):
 *     Malformed route identifier (e.g. /residents/abc/edit) is handled safely
 *     without crashing, exposing a stack trace, or modifying persistence.
 *
 *   Test 2 (Category 2 - Rejected Mutation Protects Persistence):
 *     An invalid Service Request status transition (Pending → Completed) is
 *     rejected, and the persisted record remains completely unchanged.
 *
 *   Test 3 (Category 3 - Read-Only Request Safety):
 *     Multiple GET requests (dashboard, resident listing, SR listing, SR
 *     details) do not create, update, or delete any persisted data.
 *
 *   Test 4 (Category 4 - Cross-Feature Regression):
 *     Resident deactivation is reflected in dashboard counts AND blocks
 *     future Service Request submission for that Resident — proving T07,
 *     T09, and T14 work together correctly.
 *
 *   Test 5 (Category 5 - Repeatability/Boundary):
 *     Repeated deactivation of an already-Inactive Resident is safe — the
 *     Resident remains Inactive, no error is thrown, no record is deleted,
 *     and the total count stays the same.
 *
 * Each test uses an isolated temporary SQLite database so tests never share
 * state. The pattern mirrors existing T12-T14 test files.
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
import { ResidentDeactivationService } from "../src/services/ResidentDeactivationService.js";
import { ServiceRequestStatusService } from "../src/services/ServiceRequestStatusService.js";
import { ServiceRequestSubmissionService } from "../src/services/ServiceRequestSubmissionService.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import { DashboardService } from "../src/services/DashboardService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t15-${crypto.randomUUID()}.sqlite`);
}

function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}

function makeValidResident(overrides = {}) {
  return new Resident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: Resident.Status.ACTIVE,
    ...overrides
  });
}

function makeValidServiceRequest(residentId, overrides = {}) {
  return new ServiceRequest({
    id: null,
    residentId,
    serviceType: "Barangay Clearance",
    description: "Requesting barangay clearance for employment.",
    dateRequested: "2026-10-01",
    status: ServiceRequest.Status.PENDING,
    ...overrides
  });
}

// ---------------------------------------------------------------------------
// Test 1 (Category 1 - Invalid/Malformed Input)
// Malformed route identifier is handled safely without crashing or
// exposing a stack trace, and persistence is not modified.
// ---------------------------------------------------------------------------

test("Hardening Test 1 - Malformed route identifier /residents/abc/edit returns controlled 404 without crashing", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    // Seed one valid resident so the table is not empty
    const resident = residentRepository.save(makeValidResident());

    // Record state before the malformed request
    const residentsBefore = residentRepository.findAll();
    assert.equal(residentsBefore.length, 1);

    // Request with a non-numeric ID — "abc" cannot be parsed as a number
    const response = await request(app).get("/residents/abc/edit");

    // Must NOT return HTTP 500 (uncontrolled crash)
    assert.ok(
      response.statusCode !== 500,
      `Expected non-500 status for malformed ID, got ${response.statusCode}`
    );

    // Must return 404 (controlled not-found behavior)
    assert.equal(response.statusCode, 404);

    // Must NOT expose a stack trace or raw SQL error
    assert.doesNotMatch(response.text, /Error:|at Object\.|TypeError|RangeError|stack/i);
    assert.doesNotMatch(response.text, /SELECT|INSERT|UPDATE|DELETE/i);

    // Persistence must not have changed — no new records, no modifications
    const residentsAfter = residentRepository.findAll();
    assert.equal(residentsAfter.length, 1, "No resident should be created by malformed GET");

    // The existing resident must be unchanged
    const unchanged = residentRepository.findById(resident.id);
    assert.equal(unchanged.firstName, resident.firstName);
    assert.equal(unchanged.status, Resident.Status.ACTIVE);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 2 (Category 2 - Rejected Mutation Protects Persistence)
// An invalid Service Request status transition (Pending → Completed) is
// rejected, and the full persisted record remains unchanged afterward.
// ---------------------------------------------------------------------------

test("Hardening Test 2 - Invalid SR transition (Pending→Completed) leaves persisted record completely unchanged", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    // Seed a resident and a Pending service request
    const resident = residentRepository.save(makeValidResident());
    const sr = srRepository.save(makeValidServiceRequest(resident.id, {
      status: ServiceRequest.Status.PENDING
    }));

    // Record the full state before the rejected mutation
    const before = srRepository.findById(sr.id);
    assert.equal(before.status, ServiceRequest.Status.PENDING);
    assert.equal(before.serviceType, sr.serviceType);
    assert.equal(before.description, sr.description);
    assert.equal(before.dateRequested, sr.dateRequested);
    assert.equal(before.residentId, resident.id);

    // Attempt an invalid transition: Pending → Completed (not allowed)
    const statusService = new ServiceRequestStatusService(srRepository);
    const result = statusService.manageStatus(sr.id, ServiceRequest.Status.COMPLETED);

    // The transition must be rejected
    assert.equal(result.success, false, "Pending→Completed must not succeed");
    assert.equal(result.invalidTransition, true, "Must be flagged as invalid transition");

    // Retrieve the record again and verify EVERY field is unchanged
    const after = srRepository.findById(sr.id);
    assert.equal(after.id, before.id, "ID must be unchanged");
    assert.equal(after.residentId, before.residentId, "Resident ID must be unchanged");
    assert.equal(after.serviceType, before.serviceType, "Service type must be unchanged");
    assert.equal(after.description, before.description, "Description must be unchanged");
    assert.equal(after.dateRequested, before.dateRequested, "Date requested must be unchanged");
    assert.equal(after.status, ServiceRequest.Status.PENDING, "Status must remain Pending");

    // Verify total count did not change (no phantom records created)
    const allSrs = srRepository.findAll();
    assert.equal(allSrs.length, 1, "No new SR should be created by a rejected transition");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 3 (Category 3 - Read-Only Request Safety)
// Multiple GET requests across all read-only endpoints do not create,
// update, or delete any persisted data.
// ---------------------------------------------------------------------------

test("Hardening Test 3 - Repeated GET requests (dashboard, residents, service-requests, details) do not modify persistence", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    // Seed data: 2 residents, 2 service requests
    const r1 = residentRepository.save(makeValidResident({ email: "r1@example.com" }));
    const r2 = residentRepository.save(makeValidResident({ email: "r2@example.com", status: Resident.Status.INACTIVE }));
    const sr1 = srRepository.save(makeValidServiceRequest(r1.id, { status: ServiceRequest.Status.PENDING }));
    const sr2 = srRepository.save(makeValidServiceRequest(r1.id, { status: ServiceRequest.Status.COMPLETED }));

    // Record complete state before read operations
    const residentCountBefore = residentRepository.countAll();
    const srCountBefore = srRepository.countAll();
    const r1Before = residentRepository.findById(r1.id);
    const sr1Before = srRepository.findById(sr1.id);

    // Perform multiple GET requests across all read-only endpoints
    await request(app).get("/dashboard");
    await request(app).get("/dashboard");
    await request(app).get("/residents");
    await request(app).get("/residents?q=juan");
    await request(app).get("/service-requests");
    await request(app).get("/service-requests?status=Pending");
    await request(app).get(`/service-requests/${sr1.id}`);
    await request(app).get(`/service-requests/${sr2.id}`);
    await request(app).get("/residents/new");
    await request(app).get(`/residents/${r1.id}/edit`);

    // Verify counts are unchanged
    assert.equal(residentRepository.countAll(), residentCountBefore, "Resident total must not change");
    assert.equal(srRepository.countAll(), srCountBefore, "SR total must not change");

    // Verify individual records are unchanged
    const r1After = residentRepository.findById(r1.id);
    assert.equal(r1After.status, r1Before.status, "Resident status must not change");
    assert.equal(r1After.firstName, r1Before.firstName, "Resident name must not change");

    const sr1After = srRepository.findById(sr1.id);
    assert.equal(sr1After.status, sr1Before.status, "SR status must not change");
    assert.equal(sr1After.serviceType, sr1Before.serviceType, "SR type must not change");

    // Verify the inactive resident is still inactive (no reactivation via GET)
    const r2After = residentRepository.findById(r2.id);
    assert.equal(r2After.status, Resident.Status.INACTIVE, "Inactive resident must remain inactive");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 4 (Category 4 - Cross-Feature Regression)
// Resident deactivation is reflected in dashboard counts AND blocks future
// Service Request submission — proving T07, T09, and T14 integrate correctly.
// ---------------------------------------------------------------------------

test("Hardening Test 4 - Deactivation reflected in dashboard AND blocks future SR submission (T07+T09+T14 cross-feature)", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    // Seed: 2 active residents, 0 service requests
    const r1 = residentRepository.save(makeValidResident({ email: "r1@example.com" }));
    const r2 = residentRepository.save(makeValidResident({ email: "r2@example.com" }));

    const dashboardService = new DashboardService(residentRepository, srRepository);

    // Verify initial dashboard state
    const before = dashboardService.getDashboardSummary();
    assert.equal(before.residents.total, 2);
    assert.equal(before.residents.active, 2);
    assert.equal(before.residents.inactive, 0);

    // Deactivate r1 using T07 service
    const deactivationService = new ResidentDeactivationService(residentRepository);
    const deactResult = deactivationService.deactivateResident(r1.id);
    assert.equal(deactResult.success, true);
    assert.equal(deactResult.resident.status, "Inactive");

    // Verify dashboard reflects the change (T14 cross-feature)
    const after = dashboardService.getDashboardSummary();
    assert.equal(after.residents.total, 2, "Total must remain unchanged");
    assert.equal(after.residents.active, 1, "Active must decrease by 1");
    assert.equal(after.residents.inactive, 1, "Inactive must increase by 1");

    // Verify SR submission for the now-inactive resident is blocked (T09 cross-feature)
    const validator = new ServiceRequestValidator();
    const submissionService = new ServiceRequestSubmissionService(
      validator,
      srRepository,
      residentRepository
    );

    const candidate = makeValidServiceRequest(r1.id);
    const submitResult = submissionService.submitServiceRequest(candidate);

    assert.equal(submitResult.success, false, "Submission for inactive resident must fail");
    assert.equal(submitResult.residentInactive, true, "Must be flagged as residentInactive");

    // Verify no SR was persisted
    assert.equal(srRepository.countAll(), 0, "No SR should be persisted for inactive resident");

    // Verify the still-active resident CAN still submit (control check)
    const validCandidate = makeValidServiceRequest(r2.id);
    const validResult = submissionService.submitServiceRequest(validCandidate);
    assert.equal(validResult.success, true, "Active resident must still be able to submit");
    assert.equal(srRepository.countAll(), 1, "One SR should be persisted for the active resident");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 5 (Category 5 - Repeatability/Boundary)
// Repeated deactivation of an already-Inactive Resident is safe — the
// Resident remains Inactive, no error, no deletion, total count unchanged.
// ---------------------------------------------------------------------------

test("Hardening Test 5 - Repeated deactivation of already-Inactive Resident is safe and idempotent", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    // Seed one active resident
    const resident = residentRepository.save(makeValidResident());
    assert.equal(resident.status, "Active");

    const deactivationService = new ResidentDeactivationService(residentRepository);

    // First deactivation — should succeed
    const firstResult = deactivationService.deactivateResident(resident.id);
    assert.equal(firstResult.success, true);
    assert.equal(firstResult.alreadyInactive, false);

    const afterFirst = residentRepository.findById(resident.id);
    assert.equal(afterFirst.status, "Inactive");
    assert.equal(afterFirst.id, resident.id, "ID must be preserved");

    const countAfterFirst = residentRepository.countAll();
    assert.equal(countAfterFirst, 1);

    // Second deactivation — should be safe (alreadyInactive), not throw
    const secondResult = deactivationService.deactivateResident(resident.id);
    assert.equal(secondResult.success, true, "Repeated deactivation should not error");
    assert.equal(secondResult.alreadyInactive, true, "Should be flagged as already inactive");
    assert.equal(secondResult.notFound, false, "Resident must still exist (not deleted)");

    // Verify record is still persisted, still Inactive, unchanged
    const afterSecond = residentRepository.findById(resident.id);
    assert.equal(afterSecond.status, "Inactive", "Status must remain Inactive");
    assert.equal(afterSecond.firstName, resident.firstName, "Data must be unchanged");
    assert.equal(afterSecond.email, resident.email, "Data must be unchanged");

    // Total count must not change — no deletion occurred
    const countAfterSecond = residentRepository.countAll();
    assert.equal(countAfterSecond, 1, "Total count must not change after repeated deactivation");

    // Third deactivation — boundary: still safe
    const thirdResult = deactivationService.deactivateResident(resident.id);
    assert.equal(thirdResult.success, true);
    assert.equal(thirdResult.alreadyInactive, true);

    const countAfterThird = residentRepository.countAll();
    assert.equal(countAfterThird, 1, "Total count must still be 1 after third deactivation attempt");

    // Resident must remain searchable (not deleted)
    const searchResults = residentRepository.findByName("Juan");
    assert.equal(searchResults.length, 1, "Deactivated resident must remain searchable");
    assert.equal(searchResults[0].status, "Inactive");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});
