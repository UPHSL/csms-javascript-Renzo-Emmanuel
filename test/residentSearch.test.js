import assert from "node:assert/strict";
import test, { before, after, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentService } from "../src/services/ResidentService.js";

/**
 * Search and listing tests for T05.
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

function openService() {
  const repository = openRepository();
  const service = new ResidentService(repository);
  return service;
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
  temporaryDirectory = mkdtempSync(join(tmpdir(), "csms-t05-"));
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

// Test 1 - List all persisted residents
test("listResidents returns all persisted residents", () => {
  const service = openService();
  const repository = openRepositories[0];

  repository.save(makeResident({ firstName: "Juan", lastName: "Dela Cruz" }));
  repository.save(makeResident({ firstName: "Ana", lastName: "Santos", email: "ana@example.com" }));
  repository.save(makeResident({ firstName: "Pedro", lastName: "Cruz", email: "pedro@example.com" }));

  const results = service.listResidents();

  assert.equal(results.length, 3);
});

// Test 2 - Empty listing returns empty collection, not an error
test("listResidents returns empty collection when no residents exist", () => {
  const service = openService();

  const results = service.listResidents();

  assert.ok(Array.isArray(results));
  assert.equal(results.length, 0);
});

// Test 3 - Listing uses required ordering (lastName ASC, firstName ASC, id ASC)
test("listResidents returns residents in lastName, firstName, id order", () => {
  const service = openService();
  const repository = openRepositories[0];

  // Inserted deliberately out of expected order
  repository.save(makeResident({ firstName: "Ana",   lastName: "Santos",  email: "ana@example.com" }));
  repository.save(makeResident({ firstName: "Pedro", lastName: "Cruz",    email: "pedro@example.com" }));
  repository.save(makeResident({ firstName: "Maria", lastName: "Andres",  email: "maria@example.com" }));
  repository.save(makeResident({ firstName: "Juan",  lastName: "Cruz",    email: "juan2@example.com" }));

  const results = service.listResidents();

  assert.equal(results[0].lastName, "Andres");
  assert.equal(results[1].lastName, "Cruz");
  assert.equal(results[1].firstName, "Juan");
  assert.equal(results[2].lastName, "Cruz");
  assert.equal(results[2].firstName, "Pedro");
  assert.equal(results[3].lastName, "Santos");
});

// Test 4 - Partial first name search is case-insensitive
test("searchResidents matches partial first name case-insensitively", () => {
  const service = openService();
  const repository = openRepositories[0];

  repository.save(makeResident({ firstName: "Juan", lastName: "Dela Cruz" }));

  const results = service.searchResidents("jUa");

  assert.equal(results.length, 1);
  assert.equal(results[0].firstName, "Juan");
});

// Test 5 - Partial last name search is case-insensitive
test("searchResidents matches partial last name case-insensitively", () => {
  const service = openService();
  const repository = openRepositories[0];

  repository.save(makeResident({ firstName: "Juan", lastName: "Dela Cruz" }));

  const results = service.searchResidents("cRuZ");

  assert.equal(results.length, 1);
  assert.equal(results[0].lastName, "Dela Cruz");
});

// Test 6 - Blank search returns all residents
test("searchResidents with blank term returns all residents", () => {
  const service = openService();
  const repository = openRepositories[0];

  repository.save(makeResident({ firstName: "Juan",  lastName: "Dela Cruz", email: "juan@example.com" }));
  repository.save(makeResident({ firstName: "Ana",   lastName: "Santos",    email: "ana@example.com" }));

  const listResult   = service.listResidents();
  const searchResult = service.searchResidents("   ");

  assert.equal(searchResult.length, listResult.length);
  assert.deepEqual(
    searchResult.map(r => r.id),
    listResult.map(r => r.id)
  );
});

// Test 7 - No match returns empty collection
test("searchResidents returns empty collection when no resident matches", () => {
  const service = openService();
  const repository = openRepositories[0];

  repository.save(makeResident());

  const results = service.searchResidents("ZzzUnknownResident");

  assert.ok(Array.isArray(results));
  assert.equal(results.length, 0);
});

// Test 8 - Search results preserve all resident information
test("searchResidents preserves all resident information including leading zero", () => {
  const service = openService();
  const repository = openRepositories[0];

  repository.save(makeResident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active"
  }));

  const results = service.searchResidents("Juan");

  assert.equal(results.length, 1);
  const r = results[0];
  assert.ok(r.id !== null);
  assert.equal(r.firstName, "Juan");
  assert.equal(r.lastName, "Dela Cruz");
  assert.equal(r.address, "Barangay Santo Tomas");
  assert.equal(r.contactNumber, "09171234567");
  assert.equal(r.email, "juan@example.com");
  assert.equal(r.status, "Active");
});

// Test 9 - Active and Inactive residents are both included
test("listResidents includes both Active and Inactive residents", () => {
  const service = openService();
  const repository = openRepositories[0];

  repository.save(makeResident({ status: "Active",   email: "active@example.com" }));
  repository.save(makeResident({ status: "Inactive", email: "inactive@example.com" }));

  const results = service.listResidents();

  const statuses = results.map(r => r.status);
  assert.ok(statuses.includes("Active"));
  assert.ok(statuses.includes("Inactive"));
});

// Test 10 - Matching resident is not duplicated when both names match
test("searchResidents does not duplicate a resident whose first and last name both match", () => {
  const service = openService();
  const repository = openRepositories[0];

  // "Cruz" appears in both firstName and lastName
  repository.save(makeResident({ firstName: "Cruz", lastName: "Cruz" }));

  const results = service.searchResidents("Cruz");

  assert.equal(results.length, 1);
});
