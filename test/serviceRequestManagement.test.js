/**
 * T13 - Service Request Management Interface: Presentation/Integration Tests
 *
 * Tests the HTTP presentation layer by sending real requests through the
 * Express application using Supertest. Each test uses an isolated temporary
 * SQLite database so tests never share state.
 *
 * The tests prove integration among:
 *   - Presentation layer (routes + controllers + views)
 *   - ServiceRequestQueryService (T11)
 *   - ServiceRequestSubmissionService (T09)
 *   - ServiceRequestStatusService (T10)
 *   - ServiceRequestValidator (T09)
 *   - Resident eligibility checks (T09)
 *   - Persistence (T08/T09)
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t13-${crypto.randomUUID()}.sqlite`);
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
    description: "Requesting barangay clearance for employment requirements.",
    dateRequested: "2026-10-01",
    status: ServiceRequest.Status.PENDING,
    ...overrides
  });
}

// ---------------------------------------------------------------------------
// Test 1 - Service Request Management Page Loads
// ---------------------------------------------------------------------------

test("Test 1 - Service Request Management page loads successfully", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const response = await request(app).get("/service-requests");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /Service Request Management/);
  } finally {
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 2 - Persisted Service Requests Are Displayed
// ---------------------------------------------------------------------------

test("Test 2 - Persisted Service Requests are displayed in the listing", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Medical Assistance",
      description: "Requesting help with medical bills."
    }));
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Barangay Clearance",
      description: "Clearance for employment."
    }));

    const response = await request(app).get("/service-requests");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /Medical Assistance/);
    assert.match(response.text, /Barangay Clearance/);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 3 - Required Ordering Is Preserved (dateRequested DESC, id DESC)
// ---------------------------------------------------------------------------

test("Test 3 - Listing preserves T11 ordering: dateRequested DESC then id DESC", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Save in ascending date order — listing should reverse them
    const older = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Older Request",
      dateRequested: "2026-08-01"
    }));
    const newer = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Newer Request",
      dateRequested: "2026-10-15"
    }));

    const response = await request(app).get("/service-requests");

    assert.equal(response.statusCode, 200);

    // Newer request must appear before older in the rendered HTML
    const newerIndex = response.text.indexOf("Newer Request");
    const olderIndex = response.text.indexOf("Older Request");

    assert.ok(
      newerIndex < olderIndex,
      "Newer request (dateRequested DESC) must appear before older request"
    );

    // IDs are referenced to confirm both are present
    assert.ok(older.id !== null);
    assert.ok(newer.id !== null);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 4 - Text Search Uses T11 Behavior (partial, case-insensitive)
// ---------------------------------------------------------------------------

test("Test 4 - Text search uses T11 partial case-insensitive behavior", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Barangay Clearance",
      description: "Requesting barangay clearance for employment."
    }));
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Medical Assistance",
      description: "Help with medical costs."
    }));

    // Partial, case-insensitive match on serviceType
    const response = await request(app).get("/service-requests?q=CLEARANCE");

    assert.equal(response.statusCode, 200);
    // Matching request appears
    assert.match(response.text, /Barangay Clearance/);
    // Non-matching request does not appear
    assert.doesNotMatch(response.text, /Medical Assistance/);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 5 - Status Filter Uses T11 Behavior
// ---------------------------------------------------------------------------

test("Test 5 - Status filter displays only requests with the selected status", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Pending request
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Pending Service",
      status: ServiceRequest.Status.PENDING
    }));

    // Cancelled request (manually saved with terminal status)
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Cancelled Service",
      status: ServiceRequest.Status.CANCELLED
    }));

    const response = await request(app).get("/service-requests?status=Pending");

    assert.equal(response.statusCode, 200);
    // Only Pending appears
    assert.match(response.text, /Pending Service/);
    // Cancelled does not appear
    assert.doesNotMatch(response.text, /Cancelled Service/);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 6 - Combined Search and Status Filter Works
// ---------------------------------------------------------------------------

test("Test 6 - Combined text search and status filter returns only requests matching both", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Matches text only (wrong status)
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Barangay Clearance",
      description: "Clearance for school enrollment.",
      status: ServiceRequest.Status.CANCELLED
    }));

    // Matches status only (wrong text) — description must NOT contain "clearance"
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Medical Assistance",
      description: "Help with hospital bills.",
      status: ServiceRequest.Status.PENDING
    }));

    // Matches both text and status — this is the one that should appear
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Barangay Clearance",
      description: "Clearance for employment purposes.",
      status: ServiceRequest.Status.PENDING
    }));

    // Matches neither
    srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Financial Aid",
      description: "Requesting financial support.",
      status: ServiceRequest.Status.COMPLETED
    }));

    const response = await request(app)
      .get("/service-requests?q=clearance&status=Pending");

    assert.equal(response.statusCode, 200);

    // Only the Pending Barangay Clearance request matches both conditions.
    // The listing table shows serviceType — confirm it appears exactly once
    // and that non-matching service types are absent.
    assert.match(response.text, /Barangay Clearance/);
    assert.doesNotMatch(response.text, /Medical Assistance/);
    assert.doesNotMatch(response.text, /Financial Aid/);

    // The Cancelled "Barangay Clearance" must not appear (status doesn't match).
    // We verify only one data row is present: the table renders the Pending one.
    // Count occurrences of the serviceType in the table body to confirm uniqueness.
    const matches = response.text.match(/Barangay Clearance/g) ?? [];
    // serviceType appears once in the table row (the Pending one only).
    assert.equal(matches.length, 1, "Only the Pending Barangay Clearance row should appear");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 7 - Submission Form Is Accessible and Contains Required Fields
// ---------------------------------------------------------------------------

test("Test 7 - Submission form is accessible and contains required fields without id or status", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const response = await request(app).get("/service-requests/new");

    assert.equal(response.statusCode, 200);

    // Required input fields present
    assert.match(response.text, /name="residentId"/);
    assert.match(response.text, /name="serviceType"/);
    assert.match(response.text, /name="description"/);
    assert.match(response.text, /name="dateRequested"/);

    // Labels present
    assert.match(response.text, /Resident ID/);
    assert.match(response.text, /Service Type/);
    assert.match(response.text, /Description/);
    assert.match(response.text, /Date Requested/);

    // ID and initial status must NOT be manually entered
    assert.doesNotMatch(response.text, /name="id"/);
    assert.doesNotMatch(response.text, /name="status"/);
  } finally {
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 8 - Valid Submission Persists a Pending Service Request
// ---------------------------------------------------------------------------

test("Test 8 - Valid submission persists a Pending Service Request with generated ID", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    const response = await request(app)
      .post("/service-requests")
      .type("form")
      .send({
        residentId: String(resident.id),
        serviceType: "Barangay Clearance",
        description: "Requesting clearance for employment purposes.",
        dateRequested: "2026-10-15"
      });

    // Redirects after successful submission (POST/Redirect/GET)
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /\/service-requests/);

    // Exactly one Service Request was persisted
    const all = srRepository.findAll();
    assert.equal(all.length, 1);

    const saved = all[0];

    // Generated ID exists
    assert.ok(saved.id !== null);
    assert.ok(typeof saved.id === "number");

    // All submitted fields preserved
    assert.equal(saved.residentId, resident.id);
    assert.equal(saved.serviceType, "Barangay Clearance");
    assert.equal(saved.description, "Requesting clearance for employment purposes.");
    assert.equal(saved.dateRequested, "2026-10-15");

    // Status is Pending
    assert.equal(saved.status, ServiceRequest.Status.PENDING);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 9 - Invalid Submission Shows Validation Feedback and Does Not Persist
// ---------------------------------------------------------------------------

test("Test 9 - Invalid submission shows validation feedback and does not persist", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    const response = await request(app)
      .post("/service-requests")
      .type("form")
      .send({
        residentId: String(resident.id),
        serviceType: "",           // blank — invalid
        description: "",           // blank — invalid
        dateRequested: "not-a-date" // invalid format
      });

    // Should not redirect — re-renders the form with errors
    assert.equal(response.statusCode, 422);

    // Validation feedback present
    assert.match(response.text, /Service type is required\./);
    assert.match(response.text, /Description is required\./);
    assert.match(response.text, /Date requested is required/i);

    // No Service Request persisted
    const all = srRepository.findAll();
    assert.equal(all.length, 0);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 10 - Missing Resident Submission Is Rejected
// ---------------------------------------------------------------------------

test("Test 10 - Submission for a nonexistent Resident shows not-found feedback", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const response = await request(app)
      .post("/service-requests")
      .type("form")
      .send({
        residentId: "99999",       // does not exist
        serviceType: "Barangay Clearance",
        description: "Valid description.",
        dateRequested: "2026-10-15"
      });

    // Should not redirect — re-renders the form with error
    assert.equal(response.statusCode, 422);

    // Resident-not-found feedback present
    assert.match(response.text, /Resident not found\./);

    // No Service Request persisted
    const all = srRepository.findAll();
    assert.equal(all.length, 0);
  } finally {
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 11 - Inactive Resident Submission Is Rejected
// ---------------------------------------------------------------------------

test("Test 11 - Submission for an Inactive Resident shows eligibility feedback", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const inactiveResident = residentRepository.save(makeValidResident({
      status: Resident.Status.INACTIVE
    }));

    const response = await request(app)
      .post("/service-requests")
      .type("form")
      .send({
        residentId: String(inactiveResident.id),
        serviceType: "Barangay Clearance",
        description: "Valid description.",
        dateRequested: "2026-10-15"
      });

    // Should not redirect — re-renders with eligibility error
    assert.equal(response.statusCode, 422);

    // Inactive Resident eligibility feedback present
    assert.match(response.text, /Inactive Residents cannot submit new Service Requests\./);

    // No Service Request persisted
    const all = srRepository.findAll();
    assert.equal(all.length, 0);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 12 - Existing Service Request Details Can Be Viewed
// ---------------------------------------------------------------------------

test("Test 12 - Service Request details page displays all required fields", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const saved = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Medical Assistance",
      description: "Requesting help with hospital bills.",
      dateRequested: "2026-09-20"
    }));

    const response = await request(app).get(`/service-requests/${saved.id}`);

    assert.equal(response.statusCode, 200);

    // All required fields are present in the rendered response
    assert.match(response.text, new RegExp(String(saved.id)));
    assert.match(response.text, new RegExp(String(resident.id)));
    assert.match(response.text, /Medical Assistance/);
    assert.match(response.text, /Requesting help with hospital bills\./);
    assert.match(response.text, /2026-09-20/);
    assert.match(response.text, /Pending/);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 13 - Missing Service Request View Is Handled Safely
// ---------------------------------------------------------------------------

test("Test 13 - Requesting a nonexistent Service Request ID returns a controlled 404", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const response = await request(app).get("/service-requests/99999");

    assert.equal(response.statusCode, 404);

    // Renders a controlled not-found page — no stack trace
    assert.match(response.text, /Not Found|not found|404/i);
    assert.doesNotMatch(response.text, /Error:|at Object\.|stack trace/i);
  } finally {
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 14 - Pending Request Can Start Processing (Pending → In Progress)
// ---------------------------------------------------------------------------

test("Test 14 - Pending Service Request transitions to In Progress via Start Processing", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const saved = srRepository.save(makeValidServiceRequest(resident.id));

    assert.equal(saved.status, ServiceRequest.Status.PENDING);

    const response = await request(app)
      .post(`/service-requests/${saved.id}/process`);

    // Redirects after successful transition (POST/Redirect/GET)
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, new RegExp(`/service-requests/${saved.id}`));

    // Persistence reflects In Progress
    const updated = srRepository.findById(saved.id);
    assert.equal(updated.status, ServiceRequest.Status.IN_PROGRESS);

    // All other fields preserved
    assert.equal(updated.id, saved.id);
    assert.equal(updated.residentId, saved.residentId);
    assert.equal(updated.serviceType, saved.serviceType);
    assert.equal(updated.description, saved.description);
    assert.equal(updated.dateRequested, saved.dateRequested);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 15 - Pending Request Can Be Cancelled
// ---------------------------------------------------------------------------

test("Test 15 - Pending Service Request can be cancelled", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const saved = srRepository.save(makeValidServiceRequest(resident.id));

    assert.equal(saved.status, ServiceRequest.Status.PENDING);

    const response = await request(app)
      .post(`/service-requests/${saved.id}/cancel`);

    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, new RegExp(`/service-requests/${saved.id}`));

    // Persistence reflects Cancelled
    const updated = srRepository.findById(saved.id);
    assert.equal(updated.status, ServiceRequest.Status.CANCELLED);

    // All other fields preserved
    assert.equal(updated.id, saved.id);
    assert.equal(updated.residentId, saved.residentId);
    assert.equal(updated.serviceType, saved.serviceType);
    assert.equal(updated.description, saved.description);
    assert.equal(updated.dateRequested, saved.dateRequested);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 16 - In-Progress Request Can Be Completed
// ---------------------------------------------------------------------------

test("Test 16 - In Progress Service Request can be completed", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    // Save as Pending then move to In Progress via the interface
    const saved = srRepository.save(makeValidServiceRequest(resident.id));

    await request(app).post(`/service-requests/${saved.id}/process`);

    const inProgress = srRepository.findById(saved.id);
    assert.equal(inProgress.status, ServiceRequest.Status.IN_PROGRESS);

    const response = await request(app)
      .post(`/service-requests/${saved.id}/complete`);

    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, new RegExp(`/service-requests/${saved.id}`));

    // Persistence reflects Completed
    const completed = srRepository.findById(saved.id);
    assert.equal(completed.status, ServiceRequest.Status.COMPLETED);

    // All other fields preserved
    assert.equal(completed.id, saved.id);
    assert.equal(completed.residentId, saved.residentId);
    assert.equal(completed.serviceType, saved.serviceType);
    assert.equal(completed.description, saved.description);
    assert.equal(completed.dateRequested, saved.dateRequested);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 17 - In-Progress Request Can Be Cancelled
// ---------------------------------------------------------------------------

test("Test 17 - In Progress Service Request can be cancelled", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const saved = srRepository.save(makeValidServiceRequest(resident.id));

    // Move to In Progress first
    await request(app).post(`/service-requests/${saved.id}/process`);

    const inProgress = srRepository.findById(saved.id);
    assert.equal(inProgress.status, ServiceRequest.Status.IN_PROGRESS);

    const response = await request(app)
      .post(`/service-requests/${saved.id}/cancel`);

    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, new RegExp(`/service-requests/${saved.id}`));

    // Persistence reflects Cancelled
    const cancelled = srRepository.findById(saved.id);
    assert.equal(cancelled.status, ServiceRequest.Status.CANCELLED);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 18 - Invalid Direct Transition Is Still Rejected by T10
// ---------------------------------------------------------------------------

test("Test 18 - Direct invalid transition (Pending to Completed) is rejected and status unchanged", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const saved = srRepository.save(makeValidServiceRequest(resident.id));

    assert.equal(saved.status, ServiceRequest.Status.PENDING);

    // Attempt to jump Pending → Completed directly (bypassing In Progress)
    // This hits the /complete route while the request is still Pending.
    const response = await request(app)
      .post(`/service-requests/${saved.id}/complete`);

    // T10 rejects it — controller redirects back without crashing
    assert.ok(
      response.statusCode === 302 || response.statusCode === 200,
      "Should redirect or render without crashing"
    );

    // Persisted status must remain Pending — T10 enforced the rule
    const unchanged = srRepository.findById(saved.id);
    assert.equal(
      unchanged.status,
      ServiceRequest.Status.PENDING,
      "Status must remain Pending after invalid transition attempt"
    );
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 19 - Completed and Cancelled Requests Remain Visible
// ---------------------------------------------------------------------------

test("Test 19 - Completed and Cancelled requests remain visible in listing, filtering, and viewing", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());

    // Create terminal state requests directly in the repository
    const completed = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Completed Service",
      status: ServiceRequest.Status.COMPLETED
    }));
    const cancelled = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "Cancelled Service",
      status: ServiceRequest.Status.CANCELLED
    }));

    // Both appear in the main listing
    const listResponse = await request(app).get("/service-requests");
    assert.equal(listResponse.statusCode, 200);
    assert.match(listResponse.text, /Completed Service/);
    assert.match(listResponse.text, /Cancelled Service/);

    // Completed filter works
    const completedFilter = await request(app).get("/service-requests?status=Completed");
    assert.equal(completedFilter.statusCode, 200);
    assert.match(completedFilter.text, /Completed Service/);
    assert.doesNotMatch(completedFilter.text, /Cancelled Service/);

    // Cancelled filter works
    const cancelledFilter = await request(app).get("/service-requests?status=Cancelled");
    assert.equal(cancelledFilter.statusCode, 200);
    assert.match(cancelledFilter.text, /Cancelled Service/);
    assert.doesNotMatch(cancelledFilter.text, /Completed Service/);

    // Individual detail views work for terminal requests
    const completedView = await request(app).get(`/service-requests/${completed.id}`);
    assert.equal(completedView.statusCode, 200);
    assert.match(completedView.text, /Completed/);

    const cancelledView = await request(app).get(`/service-requests/${cancelled.id}`);
    assert.equal(cancelledView.statusCode, 200);
    assert.match(cancelledView.text, /Cancelled/);
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 20 - GET Requests Do Not Change Service Request State
// ---------------------------------------------------------------------------

test("Test 20 - GET requests do not create or modify any Service Request", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const residentRepository = new ResidentRepository(databasePath);
  const srRepository = new ServiceRequestRepository(databasePath);

  try {
    const resident = residentRepository.save(makeValidResident());
    const saved = srRepository.save(makeValidServiceRequest(resident.id, {
      serviceType: "GET Safety Check"
    }));

    assert.equal(saved.status, ServiceRequest.Status.PENDING);

    // Perform all read-only GET operations
    await request(app).get("/service-requests");
    await request(app).get("/service-requests?q=clearance");
    await request(app).get("/service-requests?status=Pending");
    await request(app).get("/service-requests?q=clearance&status=Pending");
    await request(app).get("/service-requests/new");
    await request(app).get(`/service-requests/${saved.id}`);

    // Status must remain unchanged
    const after = srRepository.findById(saved.id);
    assert.equal(
      after.status,
      ServiceRequest.Status.PENDING,
      "GET requests must not change Service Request status"
    );

    // No additional Service Requests created
    const all = srRepository.findAll();
    assert.equal(all.length, 1, "GET requests must not create new Service Requests");
  } finally {
    residentRepository.close();
    srRepository.close();
    removeDatabase(databasePath);
  }
});
