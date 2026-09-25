import assert from "node:assert/strict";
import test from "node:test";

import request from "supertest";

import { createApp } from "../src/app.js";
import { Resident } from "../src/models/Resident.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";

const app = createApp();

test("home page returns successfully", async () => {
  const response = await request(app).get("/");

  assert.equal(response.statusCode, 200);
});

test("home page displays the CSMS starter details", async () => {
  const response = await request(app).get("/");

  assert.match(
    response.text,
    /Community Services Management System/
  );

  assert.match(
    response.text,
    /Sprint 0 - Developer Onboarding/
  );

  assert.match(
    response.text,
    /JavaScript with Express\.js/
  );

  assert.match(response.text, /0\.1\.0/);
});

test("health endpoint returns the expected payload", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.statusCode, 200);

  assert.deepEqual(response.body, {
    status: "ok",
    application: "Community Services Management System",
    version: "0.1.0"
  });
});

test("unknown route returns HTTP 404", async () => {
  const response = await request(app).get("/does-not-exist");

  assert.equal(response.statusCode, 404);

  assert.deepEqual(response.body, {
    status: "error",
    message: "Resource not found"
  });
});

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

test("valid resident information passes validation", () => {
  const resident = makeValidResident();
  const validator = new ResidentValidator();

  assert.equal(validator.isValid(resident), true);
});

test("missing first name fails validation", () => {
  const resident = makeValidResident({
    firstName: ""
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("firstName"), true);
});

test("missing last name fails validation", () => {
  const resident = makeValidResident({
    lastName: ""
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("lastName"), true);
});

test("missing address fails validation", () => {
  const resident = makeValidResident({
    address: ""
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("address"), true);
});

test("whitespace-only required information fails validation", () => {
  const resident = makeValidResident({
    firstName: "   "
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("firstName"), true);
});

test("invalid contact number fails validation", () => {
  const resident = makeValidResident({
    contactNumber: "0917ABC4567"
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("contactNumber"), true);
});

test("invalid email fails validation", () => {
  const resident = makeValidResident({
    email: "juan.example.com"
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("email"), true);
});

test("supported resident statuses pass validation", () => {
  const activeResident = makeValidResident({
    status: "Active"
  });

  const inactiveResident = makeValidResident({
    status: "Inactive"
  });

  const validator = new ResidentValidator();

  assert.equal(validator.isValid(activeResident), true);
  assert.equal(validator.isValid(inactiveResident), true);
});

test("unsupported resident status fails validation", () => {
  const resident = makeValidResident({
    status: "Unknown"
  });

  const validator = new ResidentValidator();
  const errors = validator.validate(resident);

  assert.equal(validator.isValid(resident), false);
  assert.equal(errors.includes("status"), true);
});
