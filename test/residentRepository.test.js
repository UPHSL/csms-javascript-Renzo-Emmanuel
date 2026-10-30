import assert from "node:assert/strict";
import test, { before, after, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";

/**
 * Persistence tests for the Resident repository (T03).
 *
 * These tests use an ISOLATED, temporary SQLite database file so they:
 *  - never touch the normal development database, and
 *  - are repeatable (a fresh temp file is used for each test run).
 */

// A unique temporary directory for this test run, and the DB file inside it.
let temporaryDirectory;
let databasePath;

// Every repository opened during a test is tracked here so its SQLite
// connection can be closed afterwards. On Windows an open connection locks
// the file and prevents the temporary database from being deleted.
let openRepositories;

// Helper that builds a repository and remembers it for cleanup.
function openRepository() {
  const repository = new ResidentRepository(databasePath);
  openRepositories.push(repository);
  return repository;
}

// Resident information that already satisfies the T02 validation rules.
function makeValidResident(overrides = {}) {
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
  temporaryDirectory = mkdtempSync(join(tmpdir(), "csms-t03-"));
});

beforeEach(() => {
  // Use a brand-new database file for every test so no test depends on
  // records left behind by a previous test.
  databasePath = join(temporaryDirectory, `residents-${Date.now()}-${Math.random()}.sqlite`);
  openRepositories = [];
});

afterEach(() => {
  // Close every connection opened during the test so the file is released.
  for (const repository of openRepositories) {
    repository.close();
  }
});

after(() => {
  // Remove all temporary test databases created during this run.
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("saves a valid resident successfully", () => {
  const repository = openRepository();
  const stored = repository.save(makeValidResident());

  assert.ok(stored);
  assert.equal(stored.firstName, "Juan");
});

test("a newly persisted resident receives an identifier from the database", () => {
  const resident = makeValidResident();

  // T01 behavior: an unsaved resident has no identifier.
  assert.equal(resident.id, null);

  const repository = openRepository();
  const stored = repository.save(resident);

  // After persistence, SQLite has assigned a usable identifier.
  assert.notEqual(stored.id, null);
  assert.equal(typeof stored.id, "number");
});

test("retrieves a stored resident by its identifier", () => {
  const repository = openRepository();
  const stored = repository.save(makeValidResident());

  const found = repository.findById(stored.id);

  assert.ok(found);
  assert.equal(found.id, stored.id);
  assert.equal(found.firstName, "Juan");
});

test("preserves all resident information after storing and retrieving", () => {
  const repository = openRepository();
  const stored = repository.save(makeValidResident());

  const found = repository.findById(stored.id);

  assert.equal(found.firstName, "Juan");
  assert.equal(found.lastName, "Dela Cruz");
  assert.equal(found.address, "Barangay Santo Tomas");
  // Contact number must remain textual, keeping its leading zero.
  assert.equal(found.contactNumber, "09171234567");
  assert.equal(found.email, "juan@example.com");
  assert.equal(found.status, "Active");
});

test("preserves Active status after storing and retrieving", () => {
  const repository = openRepository();
  const stored = repository.save(makeValidResident({ status: "Active" }));

  const found = repository.findById(stored.id);

  assert.equal(found.status, "Active");
});

test("returns null when the requested resident does not exist", () => {
  const repository = openRepository();

  const found = repository.findById(999999);

  assert.equal(found, null);
});

test("stored resident is available through a different repository instance", () => {
  // First repository instance stores the resident, then closes so it no
  // longer holds the record in memory.
  const firstRepository = new ResidentRepository(databasePath);
  const stored = firstRepository.save(makeValidResident());
  firstRepository.close();

  // A second, independent repository instance opens the SAME database file.
  const secondRepository = openRepository();
  const found = secondRepository.findById(stored.id);

  // The record must still exist, proving data lives in SQLite and not
  // only inside one repository object in memory.
  assert.ok(found);
  assert.equal(found.id, stored.id);
  assert.equal(found.firstName, "Juan");
  assert.equal(found.contactNumber, "09171234567");
});

// --- Student-designed test -------------------------------------------------
// Verifies that each saved resident receives a distinct, increasing id.
// The seven required tests only ever persist a single resident, so nothing
// confirms the database actually generates a NEW identifier per row. This
// test would catch a defect where ids are hard-coded or a second insert
// reuses/overwrites the first record instead of creating a new one.
test("each saved resident gets a distinct, increasing identifier", () => {
  const repository = openRepository();

  const first = repository.save(makeValidResident({ firstName: "Ana" }));
  const second = repository.save(makeValidResident({ firstName: "Ben" }));

  assert.notEqual(first.id, null);
  assert.notEqual(second.id, null);
  assert.notEqual(first.id, second.id);
  assert.ok(second.id > first.id, "second id should be greater than first id");
});
