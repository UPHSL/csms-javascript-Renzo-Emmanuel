import assert from "node:assert/strict";
import test, { before, after, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentDeactivationService } from "../src/services/ResidentDeactivationService.js";
import { ResidentService } from "../src/services/ResidentService.js";

/**
 * Deactivation tests for T07.
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

function openDeactivationService() {
  const repository = openRepository();
  const service = new ResidentDeactivationService(repository);
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

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "csms-t07-"));
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

// Test 1 - Active resident can be deactivated
test("active resident can be deactivated successfully", () => {
  const { service, repository } = openDeactivationService();
  const saved = repository.save(makeResident({ status: "Active" }));

  const result = service.deactivateResident(saved.id);

  assert.equal(result.success, true);
  assert.equal(result.notFound, false);
  assert.equal(result.alreadyInactive, false);
  assert.ok(result.resident);
});

// Test 2 - Status becomes Inactive in persistence
test("resident status becomes Inactive in persistence after deactivation", () => {
  const { service, repository } = openDeactivationService();
  const saved = repository.save(makeResident({ status: "Active" }));

  service.deactivateResident(saved.id);

  const retrieved = repository.findById(saved.id);
  assert.equal(retrieved.status, "Inactive");
});

// Test 3 - Resident ID is preserved
test("resident ID is preserved after deactivation", () => {
  const { service, repository } = openDeactivationService();
  const saved = repository.save(makeResident());

  const result = service.deactivateResident(saved.id);

  assert.equal(result.resident.id, saved.id);
});

// Test 4 - Resident personal information is preserved
test("resident personal and contact information is preserved after deactivation", () => {
  const { service, repository } = openDeactivationService();
  const saved = repository.save(makeResident());

  service.deactivateResident(saved.id);

  const retrieved = repository.findById(saved.id);
  assert.equal(retrieved.firstName, "Juan");
  assert.equal(retrieved.lastName, "Dela Cruz");
  assert.equal(retrieved.address, "Barangay Santo Tomas");
  assert.equal(retrieved.contactNumber, "09171234567");
  assert.equal(retrieved.email, "juan@example.com");
});

// Test 5 - Deactivated resident remains retrievable via T03
test("deactivated resident remains retrievable by ID through T03", () => {
  const { service, repository } = openDeactivationService();
  const saved = repository.save(makeResident());

  service.deactivateResident(saved.id);

  const retrieved = repository.findById(saved.id);
  assert.ok(retrieved);
  assert.equal(retrieved.id, saved.id);
  assert.equal(retrieved.status, "Inactive");
});

// Test 6 - Deactivated resident remains available through T05
test("deactivated resident remains available through T05 search and listing", () => {
  const { service, repository } = openDeactivationService();
  repository.save(makeResident({ firstName: "Juan", lastName: "Dela Cruz" }));
  const saved = repository.save(makeResident({ firstName: "Maria", lastName: "Santos", email: "maria@example.com" }));

  service.deactivateResident(saved.id);

  const queryService = new ResidentService(repository);

  const listResults = queryService.listResidents();
  const listedResident = listResults.find(r => r.id === saved.id);
  assert.ok(listedResident);
  assert.equal(listedResident.status, "Inactive");

  const searchResults = queryService.searchResidents("Maria");
  const searchedResident = searchResults.find(r => r.id === saved.id);
  assert.ok(searchedResident);
  assert.equal(searchedResident.status, "Inactive");
});

// Test 7 - Already-Inactive resident is handled safely
test("already-Inactive resident is handled safely without changes", () => {
  const { service, repository } = openDeactivationService();
  const saved = repository.save(makeResident({ status: "Inactive" }));

  const result = service.deactivateResident(saved.id);

  assert.equal(result.success, true);
  assert.equal(result.alreadyInactive, true);
  assert.equal(result.notFound, false);
  assert.ok(result.resident);
  assert.equal(result.resident.id, saved.id);
  assert.equal(result.resident.status, "Inactive");

  const retrieved = repository.findById(saved.id);
  assert.equal(retrieved.status, "Inactive");
  assert.equal(retrieved.firstName, "Juan");
});

// Test 8 - Nonexistent resident is handled safely
test("deactivating a nonexistent resident returns notFound result", () => {
  const { service } = openDeactivationService();

  const result = service.deactivateResident(999999);

  assert.equal(result.success, false);
  assert.equal(result.notFound, true);
  assert.equal(result.alreadyInactive, false);
  assert.equal(result.resident, null);
});

// Test 9 - Nonexistent deactivation does not create or delete records
test("deactivating a nonexistent resident does not create or delete any record", () => {
  const { service, repository } = openDeactivationService();
  repository.save(makeResident({ email: "existing@example.com" }));

  const countBefore = repository.findAll().length;
  service.deactivateResident(999999);
  const countAfter = repository.findAll().length;

  assert.equal(countAfter, countBefore);
});

// Test 10 - Deactivating one resident does not affect another
test("deactivating one resident does not affect other residents", () => {
  const { service, repository } = openDeactivationService();
  const first = repository.save(makeResident({ email: "first@example.com" }));
  const second = repository.save(makeResident({ email: "second@example.com" }));

  service.deactivateResident(first.id);

  const retrievedFirst = repository.findById(first.id);
  const retrievedSecond = repository.findById(second.id);

  assert.equal(retrievedFirst.status, "Inactive");
  assert.equal(retrievedSecond.status, "Active");
  assert.equal(retrievedSecond.firstName, "Juan");
  assert.equal(retrievedSecond.contactNumber, "09171234567");
});
