import assert from "node:assert/strict";
import test, { before, after, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import { ResidentUpdateService } from "../src/services/ResidentUpdateService.js";
import { ResidentService } from "../src/services/ResidentService.js";

/**
 * Update tests for T06.
 *
 * Each test uses an isolated temporary SQLite database so tests are
 * independent and repeatable.
 */

let temporaryDirectory;
let databasePath;
let openRepositories;

function openRepository() {
  const repository = new ResidentRepository(databasePath);
  openRepositories.push(repository);
  return repository;
}

function openUpdateService() {
  const repository = openRepository();
  const validator = new ResidentValidator();
  const service = new ResidentUpdateService(validator, repository);
  return { service, repository };
}

function makeResident(overrides = {}) {
  return new Resident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active",
    ...overrides
  });
}

function makeProposedInfo(overrides = {}) {
  return {
    firstName: "Miguel",
    lastName: "Santos",
    address: "Barangay Bagong Silang",
    contactNumber: "09181234567",
    email: "miguel@example.com",
    ...overrides
  };
}

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "csms-t06-"));
});

beforeEach(() => {
  databasePath = join(temporaryDirectory, `residents-${Date.now()}-${Math.random()}.sqlite`);
  openRepositories = [];
});

afterEach(() => {
  for (const repository of openRepositories) {
    repository.close();
  }
});

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

// Test 1 - Valid update succeeds
test("valid resident update succeeds", () => {
  const { service, repository } = openUpdateService();
  const saved = repository.save(makeResident());

  const result = service.updateResident(saved.id, makeProposedInfo());

  assert.equal(result.success, true);
  assert.equal(result.notFound, false);
  assert.ok(result.resident);
  assert.deepEqual(result.errors, []);
});

// Test 2 - Resident ID is preserved after update
test("resident ID is preserved after a valid update", () => {
  const { service, repository } = openUpdateService();
  const saved = repository.save(makeResident());

  const result = service.updateResident(saved.id, makeProposedInfo());

  assert.equal(result.resident.id, saved.id);
});

// Test 3 - All permitted fields are persisted
test("all permitted fields are persisted after a valid update", () => {
  const { service, repository } = openUpdateService();
  const saved = repository.save(makeResident());

  const proposed = makeProposedInfo();
  service.updateResident(saved.id, proposed);

  const retrieved = repository.findById(saved.id);
  assert.equal(retrieved.firstName, proposed.firstName);
  assert.equal(retrieved.lastName, proposed.lastName);
  assert.equal(retrieved.address, proposed.address);
  assert.equal(retrieved.contactNumber, proposed.contactNumber);
  assert.equal(retrieved.email, proposed.email);
});

// Test 4 - Status is preserved after update (both Active and Inactive)
test("resident status is preserved after a valid update", () => {
  const { service, repository } = openUpdateService();

  const activeResident = repository.save(makeResident({ status: "Active", email: "active@example.com" }));
  const inactiveResident = repository.save(makeResident({ status: "Inactive", email: "inactive@example.com" }));

  const activeResult = service.updateResident(activeResident.id, makeProposedInfo({ email: "active2@example.com" }));
  const inactiveResult = service.updateResident(inactiveResident.id, makeProposedInfo({ email: "inactive2@example.com" }));

  assert.equal(activeResult.resident.status, "Active");
  assert.equal(inactiveResult.resident.status, "Inactive");
});

// Test 5 - Invalid update fails validation
test("invalid update fails and returns validation errors", () => {
  const { service, repository } = openUpdateService();
  const saved = repository.save(makeResident());

  const result = service.updateResident(saved.id, makeProposedInfo({ firstName: "" }));

  assert.equal(result.success, false);
  assert.equal(result.notFound, false);
  assert.ok(result.errors.includes("firstName"));
  assert.equal(result.resident, null);
});

// Test 6 - Invalid update does not modify stored data
test("invalid update does not modify the persisted resident", () => {
  const { service, repository } = openUpdateService();
  const saved = repository.save(makeResident());

  service.updateResident(saved.id, makeProposedInfo({ firstName: "", contactNumber: "INVALID" }));

  const retrieved = repository.findById(saved.id);
  assert.equal(retrieved.firstName, "Juan");
  assert.equal(retrieved.lastName, "Dela Cruz");
  assert.equal(retrieved.contactNumber, "09171234567");
});

// Test 7 - Nonexistent resident is handled safely
test("updating a nonexistent resident returns notFound result", () => {
  const { service } = openUpdateService();

  const result = service.updateResident(999999, makeProposedInfo());

  assert.equal(result.success, false);
  assert.equal(result.notFound, true);
  assert.equal(result.resident, null);
  assert.deepEqual(result.errors, []);
});

// Test 8 - Nonexistent update does not create a new resident
test("updating a nonexistent resident does not create a new record", () => {
  const { service, repository } = openUpdateService();

  const before = repository.findAll().length;
  service.updateResident(999999, makeProposedInfo());
  const after = repository.findAll().length;

  assert.equal(after, before);
});

// Test 9 - Updated resident is visible through T05 search
test("updated resident is visible through T05 search after update", () => {
  const { service, repository } = openUpdateService();
  const saved = repository.save(makeResident({ firstName: "Juan", lastName: "Dela Cruz" }));

  service.updateResident(saved.id, makeProposedInfo({ firstName: "Miguel", lastName: "Santos" }));

  const queryService = new ResidentService(repository);
  const results = queryService.searchResidents("Miguel");

  assert.equal(results.length, 1);
  assert.equal(results[0].firstName, "Miguel");
  assert.equal(results[0].lastName, "Santos");
  assert.equal(results[0].id, saved.id);
});

// Test 10 - Updated info and contact number are fully preserved
test("updated information and contact number leading zero are preserved", () => {
  const { service, repository } = openUpdateService();
  const saved = repository.save(makeResident());

  const proposed = makeProposedInfo({ contactNumber: "09181234567" });
  const result = service.updateResident(saved.id, proposed);

  assert.equal(result.success, true);
  assert.equal(result.resident.firstName, proposed.firstName);
  assert.equal(result.resident.lastName, proposed.lastName);
  assert.equal(result.resident.address, proposed.address);
  assert.equal(result.resident.contactNumber, "09181234567");
  assert.equal(result.resident.email, proposed.email);
  assert.equal(result.resident.id, saved.id);
  assert.equal(result.resident.status, "Active");
});
