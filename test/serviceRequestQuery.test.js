/**
 * T11 — Search and View Service Requests
 *
 * Automated tests for the ServiceRequestQueryService and the T11 query
 * extensions added to ServiceRequestRepository.
 *
 * Every test uses an isolated temporary SQLite database file so tests are
 * completely independent and can be run in any order. The same wiring
 * pattern used in T09 and T10 tests is followed here: ResidentRepository
 * and ServiceRequestRepository share the same file path, and
 * ServiceRequestSubmissionService is used to create realistic persisted
 * fixture data through the established T09 pathway.
 *
 * These tests exercise actual SQLite persistence — no in-memory arrays or
 * mocked repositories are used.
 */

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
import { ServiceRequestQueryService } from "../src/services/ServiceRequestQueryService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t11-${crypto.randomUUID()}.sqlite`);
}

function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}

/**
 * Build a fully-wired setup with all repositories and services sharing one
 * isolated SQLite file.
 */
function createQuerySetup() {
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
  const queryService = new ServiceRequestQueryService(serviceRequestRepository);

  return {
    databasePath,
    residentRepository,
    serviceRequestRepository,
    submissionService,
    statusService,
    queryService,
  };
}

/** Persist and return a new Active Resident. */
function saveActiveResident(setup, overrides = {}) {
  return setup.residentRepository.save(
    new Resident({
      firstName: "Juan",
      lastName: "Dela Cruz",
      address: "Barangay Santo Tomas",
      contactNumber: "09171234567",
      email: `resident-${crypto.randomUUID()}@example.com`,
      status: "Active",
      ...overrides,
    })
  );
}

/**
 * Submit a ServiceRequest through T09 and return the persisted record.
 * Defaults produce a Pending "Document Request" unless overridden.
 */
function submitRequest(setup, residentId, overrides = {}) {
  const result = setup.submissionService.submitServiceRequest(
    new ServiceRequest({
      residentId,
      serviceType: "Document Request",
      description: "Requesting a barangay clearance.",
      dateRequested: "2026-09-25",
      status: "Pending",
      ...overrides,
    })
  );
  return result.serviceRequest;
}

// ---------------------------------------------------------------------------
// Test 1 — List all persisted Service Requests
// ---------------------------------------------------------------------------

test("listServiceRequests returns all persisted Service Requests", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    submitRequest(setup, resident.id, { serviceType: "Document Request",    dateRequested: "2026-09-20" });
    submitRequest(setup, resident.id, { serviceType: "Community Assistance", dateRequested: "2026-09-21" });
    submitRequest(setup, resident.id, { serviceType: "Barangay Clearance",   dateRequested: "2026-09-22" });

    const results = setup.queryService.listServiceRequests();

    assert.equal(results.length, 3);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 2 — Empty listing returns an empty collection
// ---------------------------------------------------------------------------

test("listServiceRequests returns empty array when no Service Requests exist", () => {
  const setup = createQuerySetup();
  try {
    const results = setup.queryService.listServiceRequests();

    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 3 — Listing uses required ordering (dateRequested DESC, id DESC)
// ---------------------------------------------------------------------------

test("listServiceRequests orders by dateRequested DESC then id DESC", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    // Insert deliberately out of expected order.
    // Two requests share 2026-09-18; the one with the higher id must appear first.
    const r1 = submitRequest(setup, resident.id, { serviceType: "A", dateRequested: "2026-09-15" });
    const r2 = submitRequest(setup, resident.id, { serviceType: "B", dateRequested: "2026-09-18" });
    const r3 = submitRequest(setup, resident.id, { serviceType: "C", dateRequested: "2026-09-18" });
    const r4 = submitRequest(setup, resident.id, { serviceType: "D", dateRequested: "2026-09-10" });

    const results = setup.queryService.listServiceRequests();

    assert.equal(results.length, 4);
    // Expected order: r3 (2026-09-18, higher id), r2 (2026-09-18, lower id),
    //                 r1 (2026-09-15), r4 (2026-09-10)
    assert.equal(results[0].id, r3.id);
    assert.equal(results[1].id, r2.id);
    assert.equal(results[2].id, r1.id);
    assert.equal(results[3].id, r4.id);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 4 — View existing Service Request by ID
// ---------------------------------------------------------------------------

test("viewServiceRequest returns the correct Service Request by id", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);
    const persisted = submitRequest(setup, resident.id, {
      serviceType: "Barangay Clearance",
      description: "Needed for employment.",
      dateRequested: "2026-10-01",
    });

    const found = setup.queryService.viewServiceRequest(persisted.id);

    assert.ok(found);
    assert.equal(found.id, persisted.id);
    assert.equal(found.serviceType, "Barangay Clearance");
    assert.equal(found.description, "Needed for employment.");
    assert.equal(found.dateRequested, "2026-10-01");
    assert.equal(found.status, "Pending");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 5 — Viewing an unknown ID is handled safely
// ---------------------------------------------------------------------------

test("viewServiceRequest returns null for an unknown id and creates no record", () => {
  const setup = createQuerySetup();
  try {
    const result = setup.queryService.viewServiceRequest(999999);

    // Must return null — not an exception, not a placeholder record.
    assert.equal(result, null);

    // Confirm nothing was inserted.
    const shouldNotExist = setup.serviceRequestRepository.findById(999999);
    assert.equal(shouldNotExist, null);

    const allRecords = setup.queryService.listServiceRequests();
    assert.equal(allRecords.length, 0);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 6 — Partial serviceType search is case-insensitive
// ---------------------------------------------------------------------------

test("searchServiceRequests matches partial serviceType case-insensitively", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    submitRequest(setup, resident.id, {
      serviceType: "Barangay Clearance",
      description: "Needed for employment.",
      dateRequested: "2026-09-20",
    });
    submitRequest(setup, resident.id, {
      serviceType: "Community Assistance",
      description: "Medical support needed.",
      dateRequested: "2026-09-21",
    });

    // "cLeAr" is a partial, mixed-case fragment of "Barangay Clearance".
    const { success, results } = setup.queryService.searchServiceRequests("cLeAr");

    assert.equal(success, true);
    assert.equal(results.length, 1);
    assert.equal(results[0].serviceType, "Barangay Clearance");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 7 — Partial description search is case-insensitive
// ---------------------------------------------------------------------------

test("searchServiceRequests matches partial description case-insensitively", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    submitRequest(setup, resident.id, {
      serviceType: "Document Request",
      description: "Requesting barangay clearance for employment requirements.",
      dateRequested: "2026-09-20",
    });
    submitRequest(setup, resident.id, {
      serviceType: "Community Assistance",
      description: "Assistance needed for medical support.",
      dateRequested: "2026-09-21",
    });

    // "EMPLOYMENT" is an all-caps fragment of the description on the first request.
    const { success, results } = setup.queryService.searchServiceRequests("EMPLOYMENT");

    assert.equal(success, true);
    assert.equal(results.length, 1);
    assert.ok(results[0].description.toLowerCase().includes("employment"));
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 8 — Blank search returns all Service Requests (same as listing)
// ---------------------------------------------------------------------------

test("searchServiceRequests with blank term returns all Service Requests in listing order", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    submitRequest(setup, resident.id, { serviceType: "A", dateRequested: "2026-09-20" });
    submitRequest(setup, resident.id, { serviceType: "B", dateRequested: "2026-09-21" });
    submitRequest(setup, resident.id, { serviceType: "C", dateRequested: "2026-09-22" });

    const listResult   = setup.queryService.listServiceRequests();
    const { success, results: searchResult } =
      setup.queryService.searchServiceRequests("      ");

    assert.equal(success, true);
    assert.equal(searchResult.length, listResult.length);
    assert.deepEqual(
      searchResult.map(r => r.id),
      listResult.map(r => r.id)
    );
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 9 — No text match returns an empty collection
// ---------------------------------------------------------------------------

test("searchServiceRequests returns empty array when no records match the term", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    submitRequest(setup, resident.id, {
      serviceType: "Barangay Clearance",
      description: "For employment requirements.",
    });

    const { success, results } =
      setup.queryService.searchServiceRequests("ZzzAbsolutelyNoMatch");

    assert.equal(success, true);
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 10 — Status filter returns only Service Requests with that status
// ---------------------------------------------------------------------------

test("searchServiceRequests with status filter returns only matching status", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    // Submit three requests and advance two of them past Pending.
    const pending1 = submitRequest(setup, resident.id, { serviceType: "Request A", dateRequested: "2026-09-20" });
    const pending2 = submitRequest(setup, resident.id, { serviceType: "Request B", dateRequested: "2026-09-21" });
    const pending3 = submitRequest(setup, resident.id, { serviceType: "Request C", dateRequested: "2026-09-22" });

    // Advance pending2 to In Progress.
    setup.statusService.manageStatus(pending2.id, "In Progress");
    // Cancel pending3.
    setup.statusService.manageStatus(pending3.id, "Cancelled");

    // Filter for Pending only.
    const { success, results } =
      setup.queryService.searchServiceRequests("", "Pending");

    assert.equal(success, true);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, pending1.id);
    assert.equal(results[0].status, "Pending");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 11 — Unfiltered query includes all four lifecycle states
// ---------------------------------------------------------------------------

test("listServiceRequests includes all four lifecycle states", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    const r1 = submitRequest(setup, resident.id, { serviceType: "R1", dateRequested: "2026-09-20" });
    const r2 = submitRequest(setup, resident.id, { serviceType: "R2", dateRequested: "2026-09-21" });
    const r3 = submitRequest(setup, resident.id, { serviceType: "R3", dateRequested: "2026-09-22" });
    const r4 = submitRequest(setup, resident.id, { serviceType: "R4", dateRequested: "2026-09-23" });

    // Advance to cover all four statuses.
    setup.statusService.manageStatus(r2.id, "In Progress");
    setup.statusService.manageStatus(r3.id, "In Progress");
    setup.statusService.manageStatus(r3.id, "Completed");
    setup.statusService.manageStatus(r4.id, "Cancelled");

    const results = setup.queryService.listServiceRequests();

    assert.equal(results.length, 4);
    const statuses = results.map(r => r.status);
    assert.ok(statuses.includes("Pending"));
    assert.ok(statuses.includes("In Progress"));
    assert.ok(statuses.includes("Completed"));
    assert.ok(statuses.includes("Cancelled"));
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 12 — Combined text search and status filter
// ---------------------------------------------------------------------------

test("searchServiceRequests with text and status returns only records matching both", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    // Request A: matches text ("clearance") AND status (Pending) — EXPECTED
    const requestA = submitRequest(setup, resident.id, {
      serviceType: "Barangay Clearance",
      description: "Employment requirement.",
      dateRequested: "2026-09-20",
    });

    // Request B: matches text ("clearance") but NOT status (will be Completed)
    const requestB = submitRequest(setup, resident.id, {
      serviceType: "Barangay Clearance",
      description: "Scholarship requirement.",
      dateRequested: "2026-09-21",
    });

    // Request C: matches status (Pending) but NOT text (no "clearance")
    submitRequest(setup, resident.id, {
      serviceType: "Community Assistance",
      description: "Medical support needed.",
      dateRequested: "2026-09-22",
    });

    // Request D: matches neither
    const requestD = submitRequest(setup, resident.id, {
      serviceType: "Community Assistance",
      description: "General community help.",
      dateRequested: "2026-09-23",
    });

    // Advance B to In Progress then Completed.
    setup.statusService.manageStatus(requestB.id, "In Progress");
    setup.statusService.manageStatus(requestB.id, "Completed");

    // Cancel D.
    setup.statusService.manageStatus(requestD.id, "Cancelled");

    const { success, results } =
      setup.queryService.searchServiceRequests("clearance", "Pending");

    assert.equal(success, true);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, requestA.id);
    assert.equal(results[0].status, "Pending");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 13 — Matching Service Request is not duplicated
// ---------------------------------------------------------------------------

test("searchServiceRequests does not duplicate a record whose serviceType and description both match", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    // "assistance" appears in both serviceType and description.
    submitRequest(setup, resident.id, {
      serviceType: "Community Assistance",
      description: "Assistance requested for medical support.",
      dateRequested: "2026-09-20",
    });

    const { success, results } =
      setup.queryService.searchServiceRequests("assistance");

    assert.equal(success, true);
    assert.equal(results.length, 1);
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 14 — Query result preserves complete Service Request information
// ---------------------------------------------------------------------------

test("query result preserves all six Service Request fields", () => {
  const setup = createQuerySetup();
  try {
    const resident = saveActiveResident(setup);

    const persisted = submitRequest(setup, resident.id, {
      serviceType: "Barangay Clearance",
      description: "For employment requirements.",
      dateRequested: "2026-10-05",
    });

    // Verify through listing.
    const listResults = setup.queryService.listServiceRequests();
    assert.equal(listResults.length, 1);
    const fromList = listResults[0];
    assert.equal(fromList.id, persisted.id);
    assert.equal(fromList.residentId, resident.id);
    assert.equal(fromList.serviceType, "Barangay Clearance");
    assert.equal(fromList.description, "For employment requirements.");
    assert.equal(fromList.dateRequested, "2026-10-05");
    assert.equal(fromList.status, "Pending");

    // Verify through search.
    const { results: searchResults } =
      setup.queryService.searchServiceRequests("clearance");
    assert.equal(searchResults.length, 1);
    const fromSearch = searchResults[0];
    assert.equal(fromSearch.id, persisted.id);
    assert.equal(fromSearch.residentId, resident.id);
    assert.equal(fromSearch.serviceType, "Barangay Clearance");
    assert.equal(fromSearch.description, "For employment requirements.");
    assert.equal(fromSearch.dateRequested, "2026-10-05");
    assert.equal(fromSearch.status, "Pending");

    // Verify through view.
    const fromView = setup.queryService.viewServiceRequest(persisted.id);
    assert.ok(fromView);
    assert.equal(fromView.id, persisted.id);
    assert.equal(fromView.residentId, resident.id);
    assert.equal(fromView.serviceType, "Barangay Clearance");
    assert.equal(fromView.description, "For employment requirements.");
    assert.equal(fromView.dateRequested, "2026-10-05");
    assert.equal(fromView.status, "Pending");
  } finally {
    setup.serviceRequestRepository.close();
    setup.residentRepository.close();
    removeDatabase(setup.databasePath);
  }
});
