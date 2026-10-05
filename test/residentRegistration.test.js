import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { DatabaseSync } from "node:sqlite";

import { Resident } from "../src/models/Resident.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentRegistrationService } from "../src/services/ResidentRegistrationService.js";

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t04-${crypto.randomUUID()}.sqlite`);
}

function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}

function makeValidResident() {
  return new Resident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active"
  });
}

function makeResidentWithMissingFirstName() {
  return new Resident({
    firstName: "",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com",
    status: "Active"
  });
}

function createRegistrationSetup() {
  const databasePath = createTemporaryDatabasePath();
  const repository = new ResidentRepository(databasePath);
  const validator = new ResidentValidator();
  const service = new ResidentRegistrationService(validator, repository);
  return { databasePath, repository, validator, service };
}

function countResidents(databasePath) {
  const database = new DatabaseSync(databasePath);
  try {
    const row = database.prepare("SELECT COUNT(*) AS count FROM residents").get();
    return Number(row.count);
  } finally {
    database.close();
  }
}

test("registers a valid Resident", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const result = service.registerResident(makeValidResident());
    assert.equal(result.success, true);
    assert.ok(result.resident);
    assert.deepEqual(result.errors, []);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

test("registered Resident receives an identifier", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const resident = makeValidResident();
    assert.equal(resident.id, null);
    const result = service.registerResident(resident);
    assert.equal(result.success, true);
    assert.ok(result.resident);
    assert.notEqual(result.resident.id, null);
    assert.notEqual(result.resident.id, undefined);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

test("registered Resident is persisted", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const result = service.registerResident(makeValidResident());
    assert.equal(result.success, true);
    assert.ok(result.resident);
    const storedResident = repository.findById(result.resident.id);
    assert.ok(storedResident);
    assert.equal(storedResident.id, result.resident.id);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

test("registered Resident information is preserved", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const result = service.registerResident(makeValidResident());
    const storedResident = repository.findById(result.resident.id);
    assert.ok(storedResident);
    assert.equal(storedResident.firstName, "Juan");
    assert.equal(storedResident.lastName, "Dela Cruz");
    assert.equal(storedResident.address, "Barangay Santo Tomas");
    assert.equal(storedResident.contactNumber, "09171234567");
    assert.equal(storedResident.email, "juan@example.com");
    assert.equal(storedResident.status, "Active");
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

test("registration preserves the default Active status", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const resident = makeValidResident();
    assert.equal(resident.status, "Active");
    const result = service.registerResident(resident);
    assert.equal(result.success, true);
    assert.equal(result.resident.status, "Active");
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

test("invalid Resident registration fails", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const result = service.registerResident(makeResidentWithMissingFirstName());
    assert.equal(result.success, false);
    assert.equal(result.resident, null);
    assert.ok(result.errors.length > 0);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

test("invalid Resident is not persisted", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const countBefore = countResidents(databasePath);
    const result = service.registerResident(makeResidentWithMissingFirstName());
    const countAfter = countResidents(databasePath);
    assert.equal(result.success, false);
    assert.equal(countAfter, countBefore);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

test("registration identifies the validation failure", () => {
  const { databasePath, repository, service } = createRegistrationSetup();
  try {
    const result = service.registerResident(makeResidentWithMissingFirstName());
    assert.equal(result.success, false);
    assert.ok(result.errors.includes("firstName"));
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});
