/**
 * T14 - CSMS Dashboard: Automated Tests
 *
 * Covers all 15 required test scenarios from the T14 specification.
 *
 * Tests 1-2  use Supertest to verify HTTP-level rendering.
 * Tests 3-15 use DashboardService and repositories directly so assertions
 * are precise and independent of HTML structure.
 *
 * Each test uses an isolated temporary SQLite database so tests never
 * share state. The pattern mirrors residentManagement.test.js and
 * serviceRequestManagement.test.js established in T12/T13.
 *
 * Tested scenarios:
 *   Test 1  - Dashboard loads successfully (HTTP 200, title present)
 *   Test 2  - Empty dashboard displays zero counts and safe empty state
 *   Test 3  - Total Resident count is correct
 *   Test 4  - Resident status counts are correct and reconcile
 *   Test 5  - Total Service Request count is correct
 *   Test 6  - Service Request status counts are correct
 *   Test 7  - Service Request counts reconcile (total = sum of statuses)
 *   Test 8  - Open Request count is correct (Pending + In Progress only)
 *   Test 9  - Resident deactivation is reflected in dashboard counts
 *   Test 10 - Service Request Pending→In Progress is reflected
 *   Test 11 - Terminal transition (In Progress→Completed) updates Open count
 *   Test 12 - Recent Requests return no more than five records
 *   Test 13 - Recent Requests use correct ordering (dateRequested DESC, id DESC)
 *   Test 14 - Terminal requests may appear in Recent results
 *   Test 15 - GET /dashboard does not modify persistence
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
import { DashboardService } from "../src/services/DashboardService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t14-${crypto.randomUUID()}.sqlite`);
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
// Test 1 - Dashboard Loads Successfully
// ---------------------------------------------------------------------------

test("Test 1 - Dashboard loads successfully and renders the CSMS Dashboard title", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const response = await request(app).get("/dashboard");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /CSMS Dashboard/i);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 2 - Empty Dashboard Displays Zero Counts
// ---------------------------------------------------------------------------

test("Test 2 - Empty database yields all zero counts and safe empty-state message", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const response = await request(app).get("/dashboard");

    assert.equal(response.statusCode, 200);

    // All numeric metrics must show 0 — rendered as plain text in the view
    // Counting occurrences of ">0<" (the rendered stat value) for each metric
    const zeroMatches = (response.text.match(/>0</g) ?? []).length;
    // There are 9 metrics (total/active/inactive residents + total/open/pending/
    // inProgress/completed/cancelled SR) — all must show 0
    assert.ok(
      zeroMatches >= 9,
      `Expected at least 9 zero-value stats, found ${zeroMatches}`
    );

    // Empty state message for recent requests
    assert.match(response.text, /No Service Requests available\./);

    // No stack traces or errors exposed
    assert.doesNotMatch(response.text, /Error:|at Object\.|stack trace/i);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 3 - Total Resident Count Is Correct
// ---------------------------------------------------------------------------

test("Test 3 - Total Resident count reflects all persisted Residents", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    residentRepository.save(makeValidResident({ email: "r1@example.com" }));
    residentRepository.save(makeValidResident({ email: "r2@example.com" }));
    residentRepository.save(makeValidResident({ email: "r3@example.com" }));

    const service = new DashboardService(residentRepository, srRepository);
    const summary = service.getDashboardSummary();

    assert.equal(summary.residents.total, 3);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 4 - Resident Status Counts Are Correct and Reconcile
// ---------------------------------------------------------------------------

test("Test 4 - Resident Active/Inactive counts are correct and total = active + inactive", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    // 3 Active, 2 Inactive
    residentRepository.save(makeValidResident({ email: "a1@example.com", status: Resident.Status.ACTIVE }));
    residentRepository.save(makeValidResident({ email: "a2@example.com", status: Resident.Status.ACTIVE }));
    residentRepository.save(makeValidResident({ email: "a3@example.com", status: Resident.Status.ACTIVE }));
    residentRepository.save(makeValidResident({ email: "i1@example.com", status: Resident.Status.INACTIVE }));
    residentRepository.save(makeValidResident({ email: "i2@example.com", status: Resident.Status.INACTIVE }));

    const service = new DashboardService(residentRepository, srRepository);
    const summary = service.getDashboardSummary();

    assert.equal(summary.residents.active, 3, "Active count should be 3");
    assert.equal(summary.residents.inactive, 2, "Inactive count should be 2");
    assert.equal(summary.residents.total, 5, "Total count should be 5");

    // Reconciliation: total must equal active + inactive
    assert.equal(
      summary.residents.total,
      summary.residents.active + summary.residents.inactive,
      "Total must equal active + inactive"
    );
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 5 - Total Service Request Count Is Correct
// ---------------------------------------------------------------------------

test("Test 5 - Total Service Request count reflects all persisted Service Requests", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    srRepository.save(makeValidServiceRequest(resident.id));
    srRepository.save(makeValidServiceRequest(resident.id));
    srRepository.save(makeValidServiceRequest(resident.id));
    srRepository.save(makeValidServiceRequest(resident.id));

    const service = new DashboardService(residentRepository, srRepository);
    const summary = service.getDashboardSummary();

    assert.equal(summary.serviceRequests.total, 4);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 6 - Service Request Status Counts Are Correct
// ---------------------------------------------------------------------------

test("Test 6 - Service Request status counts are individually correct", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // One of each status
    srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.PENDING }));
    srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.IN_PROGRESS }));
    srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.COMPLETED }));
    srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.CANCELLED }));

    const service = new DashboardService(residentRepository, srRepository);
    const summary = service.getDashboardSummary();

    assert.equal(summary.serviceRequests.pending,    1, "Pending count should be 1");
    assert.equal(summary.serviceRequests.inProgress, 1, "In Progress count should be 1");
    assert.equal(summary.serviceRequests.completed,  1, "Completed count should be 1");
    assert.equal(summary.serviceRequests.cancelled,  1, "Cancelled count should be 1");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 7 - Service Request Counts Reconcile
// ---------------------------------------------------------------------------

test("Test 7 - Service Request total reconciles: total = pending + inProgress + completed + cancelled", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // 2 Pending, 3 In Progress, 4 Completed, 1 Cancelled = 10 total
    for (let i = 0; i < 2; i++) srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.PENDING }));
    for (let i = 0; i < 3; i++) srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.IN_PROGRESS }));
    for (let i = 0; i < 4; i++) srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.COMPLETED }));
    for (let i = 0; i < 1; i++) srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.CANCELLED }));

    const service = new DashboardService(residentRepository, srRepository);
    const { serviceRequests: sr } = service.getDashboardSummary();

    assert.equal(sr.total, 10, "Total should be 10");
    assert.equal(
      sr.total,
      sr.pending + sr.inProgress + sr.completed + sr.cancelled,
      "total must equal sum of all four status counts"
    );
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 8 - Open Request Count Is Correct
// ---------------------------------------------------------------------------

test("Test 8 - Open count equals Pending + In Progress; Completed and Cancelled are excluded", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // 3 Pending, 2 In Progress → Open = 5
    for (let i = 0; i < 3; i++) srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.PENDING }));
    for (let i = 0; i < 2; i++) srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.IN_PROGRESS }));
    // Terminal states — must NOT be counted as open
    srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.COMPLETED }));
    srRepository.save(makeValidServiceRequest(resident.id, { status: ServiceRequest.Status.CANCELLED }));

    const service = new DashboardService(residentRepository, srRepository);
    const { serviceRequests: sr } = service.getDashboardSummary();

    assert.equal(sr.open, 5, "Open should equal 5 (3 Pending + 2 In Progress)");
    assert.equal(sr.open, sr.pending + sr.inProgress, "open must equal pending + inProgress");

    // Completed and Cancelled must not inflate open
    assert.ok(
      sr.open < sr.total,
      "Open must be less than total when terminal requests exist"
    );
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 9 - Resident Deactivation Is Reflected in Dashboard
// ---------------------------------------------------------------------------

test("Test 9 - Deactivating a Resident decreases Active, increases Inactive, total unchanged", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident({ status: Resident.Status.ACTIVE }));
    residentRepository.save(makeValidResident({ email: "other@example.com", status: Resident.Status.ACTIVE }));

    const service = new DashboardService(residentRepository, srRepository);

    // Snapshot before deactivation
    const before = service.getDashboardSummary();
    assert.equal(before.residents.total,    2);
    assert.equal(before.residents.active,   2);
    assert.equal(before.residents.inactive, 0);

    // Deactivate one resident using the existing T07 business service
    const deactivationService = new ResidentDeactivationService(residentRepository);
    deactivationService.deactivateResident(resident.id);

    // Snapshot after deactivation
    const after = service.getDashboardSummary();

    assert.equal(after.residents.total,    2, "Total must remain unchanged");
    assert.equal(after.residents.active,   1, "Active must decrease by 1");
    assert.equal(after.residents.inactive, 1, "Inactive must increase by 1");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 10 - Pending → In Progress Transition Is Reflected
// ---------------------------------------------------------------------------

test("Test 10 - Transitioning Pending to In Progress is reflected in dashboard counts", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const sr = srRepository.save(makeValidServiceRequest(resident.id, {
      status: ServiceRequest.Status.PENDING
    }));

    const service = new DashboardService(residentRepository, srRepository);

    // Snapshot before transition
    const before = service.getDashboardSummary();
    assert.equal(before.serviceRequests.total,      1);
    assert.equal(before.serviceRequests.pending,    1);
    assert.equal(before.serviceRequests.inProgress, 0);

    // Perform the status transition using existing T10 business service
    const statusService = new ServiceRequestStatusService(srRepository);
    statusService.manageStatus(sr.id, ServiceRequest.Status.IN_PROGRESS);

    // Snapshot after transition
    const after = service.getDashboardSummary();

    assert.equal(after.serviceRequests.total,      1, "Total must remain unchanged");
    assert.equal(after.serviceRequests.pending,    0, "Pending must decrease by 1");
    assert.equal(after.serviceRequests.inProgress, 1, "In Progress must increase by 1");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 11 - Terminal Transition Updates Open Count
// ---------------------------------------------------------------------------

test("Test 11 - In Progress → Completed decreases Open count; total unchanged", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Two In Progress requests to start
    const sr1 = srRepository.save(makeValidServiceRequest(resident.id, {
      status: ServiceRequest.Status.IN_PROGRESS
    }));
    srRepository.save(makeValidServiceRequest(resident.id, {
      status: ServiceRequest.Status.IN_PROGRESS
    }));

    const service = new DashboardService(residentRepository, srRepository);

    const before = service.getDashboardSummary();
    assert.equal(before.serviceRequests.total,      2);
    assert.equal(before.serviceRequests.inProgress, 2);
    assert.equal(before.serviceRequests.open,       2);
    assert.equal(before.serviceRequests.completed,  0);

    // Complete one of the In Progress requests via T10 service
    const statusService = new ServiceRequestStatusService(srRepository);
    statusService.manageStatus(sr1.id, ServiceRequest.Status.COMPLETED);

    const after = service.getDashboardSummary();

    assert.equal(after.serviceRequests.total,      2, "Total must remain unchanged");
    assert.equal(after.serviceRequests.inProgress, 1, "In Progress must decrease by 1");
    assert.equal(after.serviceRequests.completed,  1, "Completed must increase by 1");
    assert.equal(after.serviceRequests.open,       1, "Open must decrease by 1");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 12 - Recent Requests Return No More Than Five
// ---------------------------------------------------------------------------

test("Test 12 - Recent Service Requests returns at most 5 records even when more exist", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Persist 7 service requests
    for (let i = 1; i <= 7; i++) {
      srRepository.save(makeValidServiceRequest(resident.id, {
        serviceType: `Service ${i}`,
        dateRequested: `2026-10-0${i}`
      }));
    }

    const service = new DashboardService(residentRepository, srRepository);
    const summary = service.getDashboardSummary();

    assert.ok(
      summary.recentServiceRequests.length <= 5,
      `Expected at most 5 recent records, got ${summary.recentServiceRequests.length}`
    );
    assert.equal(summary.recentServiceRequests.length, 5, "Should return exactly 5 when more exist");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 13 - Recent Requests Use Correct Ordering
// ---------------------------------------------------------------------------

test("Test 13 - Recent Requests ordered by dateRequested DESC then id DESC", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Different dates — newer should appear first
    const older = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Older Request",
      dateRequested: "2026-08-01"
    }));
    const newer = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Newer Request",
      dateRequested: "2026-10-15"
    }));

    // Same date — higher id should appear first
    const sameDateLowerId  = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Same Date A",
      dateRequested: "2026-09-01"
    }));
    const sameDateHigherId = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Same Date B",
      dateRequested: "2026-09-01"
    }));

    const service = new DashboardService(residentRepository, srRepository);
    const { recentServiceRequests } = service.getDashboardSummary();

    // Newest date first
    assert.equal(
      recentServiceRequests[0].id,
      newer.id,
      "Newest date (2026-10-15) must be first"
    );

    // Among same-date records, higher id comes first
    const sameDateResults = recentServiceRequests.filter(
      sr => sr.dateRequested === "2026-09-01"
    );
    assert.equal(sameDateResults.length, 2, "Both same-date records should be present");
    assert.equal(
      sameDateResults[0].id,
      sameDateHigherId.id,
      "Higher id must appear before lower id for same date"
    );
    assert.equal(
      sameDateResults[1].id,
      sameDateLowerId.id,
      "Lower id must appear after higher id for same date"
    );

    // Oldest date last (within limit)
    const ids = recentServiceRequests.map(sr => sr.id);
    const olderIndex = ids.indexOf(older.id);
    const newerIndex = ids.indexOf(newer.id);
    assert.ok(newerIndex < olderIndex, "Newer date must appear before older date");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 14 - Terminal Requests May Appear in Recent Results
// ---------------------------------------------------------------------------

test("Test 14 - Completed and Cancelled requests may appear in Recent results based on recency", () => {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Create a very recent Completed and a very recent Cancelled request
    const recentCompleted = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Recent Completed",
      dateRequested: "2026-11-01",
      status: ServiceRequest.Status.COMPLETED
    }));
    const recentCancelled = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Recent Cancelled",
      dateRequested: "2026-11-02",
      status: ServiceRequest.Status.CANCELLED
    }));

    // Older pending requests that should be pushed out
    for (let i = 1; i <= 3; i++) {
      srRepository.save(makeValidServiceRequest(resident.id, {
        serviceType: `Old Pending ${i}`,
        dateRequested: "2026-08-01",
        status: ServiceRequest.Status.PENDING
      }));
    }

    const service = new DashboardService(residentRepository, srRepository);
    const { recentServiceRequests } = service.getDashboardSummary();

    const resultIds = recentServiceRequests.map(sr => sr.id);

    // The recent Completed and Cancelled must appear because they are the newest
    assert.ok(
      resultIds.includes(recentCompleted.id),
      "Recent Completed request must appear in recent results"
    );
    assert.ok(
      resultIds.includes(recentCancelled.id),
      "Recent Cancelled request must appear in recent results"
    );

    // Confirm the statuses in the results include terminal states
    const statuses = recentServiceRequests.map(sr => sr.status);
    assert.ok(
      statuses.includes(ServiceRequest.Status.COMPLETED),
      "Completed status must be present in recent results"
    );
    assert.ok(
      statuses.includes(ServiceRequest.Status.CANCELLED),
      "Cancelled status must be present in recent results"
    );
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 15 - Dashboard GET Does Not Modify Persistence
// ---------------------------------------------------------------------------

test("Test 15 - GET /dashboard does not create, update, or delete any Resident or Service Request", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const sr = srRepository.save(makeValidServiceRequest(resident.id, {
      status: ServiceRequest.Status.PENDING
    }));

    // Record state before any dashboard requests
    const residentsBefore = residentRepository.findAll();
    const srBefore        = srRepository.findAll();

    // Request the dashboard multiple times
    await request(app).get("/dashboard");
    await request(app).get("/dashboard");
    await request(app).get("/dashboard");

    // Record state after dashboard requests
    const residentsAfter = residentRepository.findAll();
    const srAfter        = srRepository.findAll();

    // Counts must be identical
    assert.equal(
      residentsAfter.length,
      residentsBefore.length,
      "Resident count must not change after GET /dashboard"
    );
    assert.equal(
      srAfter.length,
      srBefore.length,
      "Service Request count must not change after GET /dashboard"
    );

    // The specific resident and service request must be unchanged
    const residentAfter = residentRepository.findById(resident.id);
    assert.equal(residentAfter.status, Resident.Status.ACTIVE, "Resident status must remain Active");
    assert.equal(residentAfter.firstName, resident.firstName, "Resident data must be unchanged");

    const srAfterCheck = srRepository.findById(sr.id);
    assert.equal(srAfterCheck.status, ServiceRequest.Status.PENDING, "SR status must remain Pending");
    assert.equal(srAfterCheck.serviceType, sr.serviceType, "SR data must be unchanged");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});
