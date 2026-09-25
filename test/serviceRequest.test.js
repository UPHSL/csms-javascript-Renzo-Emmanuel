import assert from "node:assert/strict";
import test from "node:test";

import { ServiceRequest } from "../src/models/ServiceRequest.js";

/**
 * Domain model tests for ServiceRequest (T08).
 *
 * These tests verify only the domain representation.
 * No database, persistence, or validation is required.
 */

function makeServiceRequest(overrides = {}) {
  return new ServiceRequest({
    residentId: 25,
    serviceType: "Barangay Clearance",
    description: "Request for employment requirement",
    dateRequested: "2026-09-25",
    ...overrides
  });
}

// Test 1 - Service Request can be created
test("service request can be created with valid information", () => {
  const request = makeServiceRequest();

  assert.ok(request);
});

// Test 2 - Service Request information is accessible
test("service request information is accessible after creation", () => {
  const request = makeServiceRequest();

  assert.equal(request.residentId, 25);
  assert.equal(request.serviceType, "Barangay Clearance");
  assert.equal(request.description, "Request for employment requirement");
  assert.equal(request.dateRequested, "2026-09-25");
});

// Test 3 - Resident ID is preserved
test("service request preserves the supplied resident ID", () => {
  const request = makeServiceRequest({ residentId: 25 });

  assert.equal(request.residentId, 25);
});

// Test 4 - New Service Request has an unassigned ID
test("new service request has an unassigned id before persistence", () => {
  const request = makeServiceRequest();

  assert.equal(request.id, null);
});

// Test 5 - New Service Request defaults to Pending
test("new service request defaults to Pending status", () => {
  const request = makeServiceRequest();

  assert.equal(request.status, "Pending");
  assert.equal(request.status, ServiceRequest.Status.PENDING);
});

// Test 6 - Service Request objects are independent
test("two service request objects preserve independent information", () => {
  const first = makeServiceRequest({
    residentId: 10,
    serviceType: "Barangay Clearance",
    description: "First request",
    dateRequested: "2026-09-01"
  });

  const second = makeServiceRequest({
    residentId: 20,
    serviceType: "Certificate Request",
    description: "Second request",
    dateRequested: "2026-09-15"
  });

  assert.equal(first.residentId, 10);
  assert.equal(second.residentId, 20);
  assert.equal(first.serviceType, "Barangay Clearance");
  assert.equal(second.serviceType, "Certificate Request");
  assert.equal(first.description, "First request");
  assert.equal(second.description, "Second request");
  assert.equal(first.dateRequested, "2026-09-01");
  assert.equal(second.dateRequested, "2026-09-15");
});
