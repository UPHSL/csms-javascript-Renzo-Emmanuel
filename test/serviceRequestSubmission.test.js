import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { DatabaseSync } from "node:sqlite";

import { Resident } from "../src/models/Resident.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import { ServiceRequestSubmissionService } from "../src/services/ServiceRequestSubmissionService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t09-${crypto.randomUUID()}.sqlite`);
}

function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}

/**
 * Build a fully-wired setup using a single shared SQLite file so both
 * repositories operate on the same data.
 */
function createSubmissionSetup() {
  const databasePath = createTemporaryDatabasePath();
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);
  const validator = new ServiceRequestValidator();
  const service = new ServiceRequestSubmissionService(
    validator,
    serviceRequestRepository,
    residentRepository
  );
  return { databasePath, residentRepository, serviceRequestRepository, validator, service };
}

function makeActiveResident() {
  return new Resident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active"
  });
}

function makeInactiveResident() {
  return new Resident({
    firstName: "Maria",
    lastName: "Santos",
    address: "Barangay Pinyahan",
    contactNumber: "09181234567",
    email: "maria@example.com",
    status: "Inactive"
  });
}

function makeValidServiceRequest(residentId) {
  return new ServiceRequest({
    residentId,
    serviceType: "Document Request",
    description: "Requesting a barangay clearance.",
    dateRequested: "2026-09-25",
    status: "Pending"
  });
}

/**
 * Count rows in the service_requests table using a direct connection so
 * the count is independent of any repository instance under test.
 */
function countServiceRequests(databasePath) {
  const db = new DatabaseSync(databasePath);
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM service_requests").get();
    return Number(row.count);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Tests 1–5: successful submission
// ---------------------------------------------------------------------------

test("valid service request submission succeeds", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const result = service.submitServiceRequest(makeValidServiceRequest(resident.id));

    assert.equal(result.success, true);
    assert.equal(result.residentNotFound, false);
    assert.equal(result.residentInactive, false);
    assert.deepEqual(result.errors, []);
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

test("submitted service request receives a generated identifier", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const request = makeValidServiceRequest(resident.id);

    assert.equal(request.id, null);

    const result = service.submitServiceRequest(request);

    assert.equal(result.success, true);
    assert.ok(result.serviceRequest);
    assert.notEqual(result.serviceRequest.id, null);
    assert.notEqual(result.serviceRequest.id, undefined);
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

test("submitted service request is persisted and retrievable", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const result = service.submitServiceRequest(makeValidServiceRequest(resident.id));

    assert.equal(result.success, true);
    assert.ok(result.serviceRequest);

    const stored = serviceRequestRepository.findById(result.serviceRequest.id);
    assert.ok(stored);
    assert.equal(stored.id, result.serviceRequest.id);
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

test("submitted service request information is preserved", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const result = service.submitServiceRequest(makeValidServiceRequest(resident.id));

    const stored = serviceRequestRepository.findById(result.serviceRequest.id);
    assert.ok(stored);
    assert.equal(stored.residentId, resident.id);
    assert.equal(stored.serviceType, "Document Request");
    assert.equal(stored.description, "Requesting a barangay clearance.");
    assert.equal(stored.dateRequested, "2026-09-25");
    assert.equal(stored.status, "Pending");
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

test("submitted service request status is Pending", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const result = service.submitServiceRequest(makeValidServiceRequest(resident.id));

    assert.equal(result.success, true);
    assert.equal(result.serviceRequest.status, "Pending");

    const stored = serviceRequestRepository.findById(result.serviceRequest.id);
    assert.equal(stored.status, "Pending");
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Tests 6–8: validation failures
// ---------------------------------------------------------------------------

test("blank service type fails validation", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const request = new ServiceRequest({
      residentId: resident.id,
      serviceType: "   ",
      description: "Requesting a barangay clearance.",
      dateRequested: "2026-09-25",
      status: "Pending"
    });

    const result = service.submitServiceRequest(request);

    assert.equal(result.success, false);
    assert.ok(result.errors.includes("serviceType"));
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

test("blank description fails validation", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const request = new ServiceRequest({
      residentId: resident.id,
      serviceType: "Document Request",
      description: "",
      dateRequested: "2026-09-25",
      status: "Pending"
    });

    const result = service.submitServiceRequest(request);

    assert.equal(result.success, false);
    assert.ok(result.errors.includes("description"));
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

test("invalid service request is not persisted", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const countBefore = countServiceRequests(databasePath);

    const request = new ServiceRequest({
      residentId: resident.id,
      serviceType: "",
      description: "",
      dateRequested: "2026-09-25",
      status: "Pending"
    });

    const result = service.submitServiceRequest(request);
    const countAfter = countServiceRequests(databasePath);

    assert.equal(result.success, false);
    assert.equal(countAfter, countBefore);
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Tests 9–10: Resident eligibility failures
// ---------------------------------------------------------------------------

test("nonexistent Resident prevents submission", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const countBefore = countServiceRequests(databasePath);

    const result = service.submitServiceRequest(makeValidServiceRequest(999999));

    const countAfter = countServiceRequests(databasePath);

    assert.equal(result.success, false);
    assert.equal(result.residentNotFound, true);
    assert.equal(result.residentInactive, false);
    assert.equal(result.serviceRequest, null);
    assert.deepEqual(result.errors, []);
    assert.equal(countAfter, countBefore);
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

test("Inactive Resident cannot submit a service request", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeInactiveResident());
    const countBefore = countServiceRequests(databasePath);

    const result = service.submitServiceRequest(makeValidServiceRequest(resident.id));

    const countAfter = countServiceRequests(databasePath);

    assert.equal(result.success, false);
    assert.equal(result.residentNotFound, false);
    assert.equal(result.residentInactive, true);
    assert.equal(result.serviceRequest, null);
    assert.deepEqual(result.errors, []);
    assert.equal(countAfter, countBefore);
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 11: non-Pending initial status is rejected
// ---------------------------------------------------------------------------

test("non-Pending initial status is rejected by validation", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const request = new ServiceRequest({
      residentId: resident.id,
      serviceType: "Document Request",
      description: "Requesting a barangay clearance.",
      dateRequested: "2026-09-25",
      status: "Completed"
    });

    const result = service.submitServiceRequest(request);

    assert.equal(result.success, false);
    assert.ok(result.errors.includes("status"));
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 12: persistence survives a second repository instance
// ---------------------------------------------------------------------------

test("service request persists across repository instances", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const result = service.submitServiceRequest(makeValidServiceRequest(resident.id));

    assert.equal(result.success, true);

    // Close the first repository and open a fresh one on the same file.
    serviceRequestRepository.close();
    const secondRepository = new ServiceRequestRepository(databasePath);
    try {
      const stored = secondRepository.findById(result.serviceRequest.id);
      assert.ok(stored);
      assert.equal(stored.id, result.serviceRequest.id);
      assert.equal(stored.serviceType, "Document Request");
    } finally {
      secondRepository.close();
    }
  } finally {
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 13: submission does not modify the Resident
// ---------------------------------------------------------------------------

test("submission does not modify the Resident", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());

    service.submitServiceRequest(makeValidServiceRequest(resident.id));

    const residentAfter = residentRepository.findById(resident.id);
    assert.equal(residentAfter.id, resident.id);
    assert.equal(residentAfter.firstName, resident.firstName);
    assert.equal(residentAfter.lastName, resident.lastName);
    assert.equal(residentAfter.address, resident.address);
    assert.equal(residentAfter.contactNumber, resident.contactNumber);
    assert.equal(residentAfter.email, resident.email);
    assert.equal(residentAfter.status, resident.status);
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 14: invalid date format fails validation
// ---------------------------------------------------------------------------

test("invalid date format fails validation", () => {
  const { databasePath, residentRepository, serviceRequestRepository, service } =
    createSubmissionSetup();
  try {
    const resident = residentRepository.save(makeActiveResident());
    const request = new ServiceRequest({
      residentId: resident.id,
      serviceType: "Document Request",
      description: "Requesting a barangay clearance.",
      dateRequested: "25-09-2026",
      status: "Pending"
    });

    const result = service.submitServiceRequest(request);

    assert.equal(result.success, false);
    assert.ok(result.errors.includes("dateRequested"));
  } finally {
    serviceRequestRepository.close();
    residentRepository.close();
    removeDatabase(databasePath);
  }
});
