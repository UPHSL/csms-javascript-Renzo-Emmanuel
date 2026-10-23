/**
 * T12 - Resident Management Interface: Presentation/Integration Tests
 *
 * Tests the HTTP presentation layer by sending real requests through the
 * Express application using Supertest. Each test suite uses an isolated
 * temporary SQLite database so tests never share state.
 *
 * The tests prove integration among:
 *   - Presentation layer (routes + controllers + views)
 *   - Application services (T04-T07)
 *   - Validation (T02)
 *   - Persistence (T03)
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
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTemporaryDatabasePath() {
  return path.join(os.tmpdir(), `csms-t12-${crypto.randomUUID()}.sqlite`);
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

// ---------------------------------------------------------------------------
// Test 1 - Resident Management Page Loads Successfully
// ---------------------------------------------------------------------------

test("Test 1 - Resident Management page loads successfully", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const response = await request(app).get("/residents");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /Resident Management/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 2 - Resident List Displays Persisted Residents
// ---------------------------------------------------------------------------

test("Test 2 - Resident list displays persisted residents", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    repository.save(makeValidResident({ firstName: "Maria", lastName: "Santos" }));
    repository.save(makeValidResident({ firstName: "Jose", lastName: "Reyes" }));

    const response = await request(app).get("/residents");

    assert.equal(response.statusCode, 200);
    assert.match(response.text, /Maria/);
    assert.match(response.text, /Santos/);
    assert.match(response.text, /Jose/);
    assert.match(response.text, /Reyes/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 3 - Resident Search Uses Existing Search Behavior
// ---------------------------------------------------------------------------

test("Test 3 - Resident search uses T05 partial case-insensitive behavior", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    repository.save(makeValidResident({ firstName: "Maria", lastName: "Santos" }));
    repository.save(makeValidResident({ firstName: "Jose", lastName: "Reyes" }));

    // Partial, case-insensitive match on last name
    const response = await request(app).get("/residents?q=SAN");

    assert.equal(response.statusCode, 200);
    // Matching resident appears
    assert.match(response.text, /Santos/);
    // Non-matching resident does not appear
    assert.doesNotMatch(response.text, /Reyes/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 4 - Blank Search Displays All Residents
// ---------------------------------------------------------------------------

test("Test 4 - Blank search displays all residents", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    repository.save(makeValidResident({ firstName: "Maria", lastName: "Santos" }));
    repository.save(makeValidResident({ firstName: "Jose", lastName: "Reyes" }));

    // Empty string search
    const responseEmpty = await request(app).get("/residents?q=");
    assert.equal(responseEmpty.statusCode, 200);
    assert.match(responseEmpty.text, /Santos/);
    assert.match(responseEmpty.text, /Reyes/);

    // Whitespace-only search
    const responseWhitespace = await request(app).get("/residents?q=   ");
    assert.equal(responseWhitespace.statusCode, 200);
    assert.match(responseWhitespace.text, /Santos/);
    assert.match(responseWhitespace.text, /Reyes/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 5 - Registration Form Is Accessible
// ---------------------------------------------------------------------------

test("Test 5 - Registration form is accessible and contains required fields", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const response = await request(app).get("/residents/new");

    assert.equal(response.statusCode, 200);

    // Required input fields present
    assert.match(response.text, /name="firstName"/);
    assert.match(response.text, /name="lastName"/);
    assert.match(response.text, /name="address"/);
    assert.match(response.text, /name="contactNumber"/);
    assert.match(response.text, /name="email"/);

    // Labels present
    assert.match(response.text, /First Name/);
    assert.match(response.text, /Last Name/);
    assert.match(response.text, /Address/);
    assert.match(response.text, /Contact Number/);
    assert.match(response.text, /Email/);

    // No ID or status input fields
    assert.doesNotMatch(response.text, /name="id"/);
    assert.doesNotMatch(response.text, /name="status"/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 6 - Valid Registration Persists Resident
// ---------------------------------------------------------------------------

test("Test 6 - Valid registration persists the resident and redirects", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const response = await request(app)
      .post("/residents")
      .type("form")
      .send({
        firstName: "Ana",
        lastName: "Gomez",
        address: "456 Mabini Street",
        contactNumber: "09209876543",
        email: "ana@example.com"
      });

    // Should redirect after successful registration (POST/Redirect/GET)
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /\/residents/);

    // Resident was persisted and received an ID
    const all = repository.findAll();
    assert.equal(all.length, 1);
    assert.ok(all[0].id !== null);
    assert.equal(all[0].firstName, "Ana");
    assert.equal(all[0].lastName, "Gomez");
    assert.equal(all[0].status, Resident.Status.ACTIVE);

    // Resident appears in the management page after redirect
    const listResponse = await request(app).get("/residents");
    assert.equal(listResponse.statusCode, 200);
    assert.match(listResponse.text, /Ana/);
    assert.match(listResponse.text, /Gomez/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 7 - Invalid Registration Shows Validation Feedback and Does Not Persist
// ---------------------------------------------------------------------------

test("Test 7 - Invalid registration shows validation feedback and does not persist", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const response = await request(app)
      .post("/residents")
      .type("form")
      .send({
        firstName: "",           // blank — invalid
        lastName: "Dela Cruz",
        address: "Barangay Uno",
        contactNumber: "INVALID", // bad format
        email: "not-an-email"     // bad format
      });

    // Should not redirect — re-renders the form with errors
    assert.equal(response.statusCode, 422);

    // Validation feedback present
    assert.match(response.text, /First name is required\./);
    assert.match(response.text, /Contact number must follow the format 09XXXXXXXXX\./);
    assert.match(response.text, /Email address is invalid\./);

    // No resident persisted
    const all = repository.findAll();
    assert.equal(all.length, 0);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 8 - Edit Form Displays Existing Resident Information
// ---------------------------------------------------------------------------

test("Test 8 - Edit form displays existing resident information with ID and status read-only", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const saved = repository.save(makeValidResident({
      firstName: "Carlos",
      lastName: "Mendoza",
      address: "123 Rizal Avenue",
      contactNumber: "09171234567",
      email: "carlos@example.com"
    }));

    const response = await request(app).get(`/residents/${saved.id}/edit`);

    assert.equal(response.statusCode, 200);

    // Existing editable values present in the response
    assert.match(response.text, /Carlos/);
    assert.match(response.text, /Mendoza/);
    assert.match(response.text, /123 Rizal Avenue/);
    assert.match(response.text, /09171234567/);
    assert.match(response.text, /carlos@example\.com/);

    // ID is displayed (as read-only text, not an editable input)
    assert.match(response.text, new RegExp(String(saved.id)));
    assert.doesNotMatch(response.text, /name="id"/);

    // Status is displayed (as read-only text, not an editable input)
    assert.match(response.text, /Active/);
    assert.doesNotMatch(response.text, /name="status"/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 9 - Valid Update Persists Changes
// ---------------------------------------------------------------------------

test("Test 9 - Valid update persists changes while preserving ID and status", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const saved = repository.save(makeValidResident({
      firstName: "Carlos",
      lastName: "Mendoza",
      address: "123 Rizal Avenue",
      contactNumber: "09171234567",
      email: "carlos@example.com"
    }));

    const response = await request(app)
      .post(`/residents/${saved.id}/edit`)
      .type("form")
      .send({
        firstName: "Karl",
        lastName: "Mendoza",
        address: "789 Bonifacio Street",
        contactNumber: "09209999999",
        email: "karl@example.com"
      });

    // Redirects on success (POST/Redirect/GET)
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /\/residents/);

    // Editable fields updated
    const updated = repository.findById(saved.id);
    assert.equal(updated.firstName, "Karl");
    assert.equal(updated.address, "789 Bonifacio Street");
    assert.equal(updated.contactNumber, "09209999999");
    assert.equal(updated.email, "karl@example.com");

    // ID preserved
    assert.equal(updated.id, saved.id);

    // Status preserved
    assert.equal(updated.status, Resident.Status.ACTIVE);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 10 - Invalid Update Does Not Modify Resident
// ---------------------------------------------------------------------------

test("Test 10 - Invalid update shows validation feedback and does not modify persisted resident", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const saved = repository.save(makeValidResident({
      firstName: "Carlos",
      lastName: "Mendoza",
      address: "123 Rizal Avenue",
      contactNumber: "09171234567",
      email: "carlos@example.com"
    }));

    const response = await request(app)
      .post(`/residents/${saved.id}/edit`)
      .type("form")
      .send({
        firstName: "",            // blank — invalid
        lastName: "Mendoza",
        address: "123 Rizal Avenue",
        contactNumber: "BADNUM",  // invalid format
        email: "not-valid"        // invalid format
      });

    // Should not redirect — re-renders form with errors
    assert.equal(response.statusCode, 422);

    // Validation feedback present
    assert.match(response.text, /First name is required\./);
    assert.match(response.text, /Contact number must follow the format 09XXXXXXXXX\./);
    assert.match(response.text, /Email address is invalid\./);

    // Persisted resident remains unchanged
    const unchanged = repository.findById(saved.id);
    assert.equal(unchanged.firstName, "Carlos");
    assert.equal(unchanged.contactNumber, "09171234567");
    assert.equal(unchanged.email, "carlos@example.com");
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 11 - Missing Resident Edit Is Handled Safely
// ---------------------------------------------------------------------------

test("Test 11 - Edit form for nonexistent resident returns a controlled 404 response", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    // No residents seeded — ID 99999 does not exist
    const response = await request(app).get("/residents/99999/edit");

    assert.equal(response.statusCode, 404);

    // Renders a controlled not-found page, not a stack trace
    assert.match(response.text, /Not Found|not found|404/i);
    assert.doesNotMatch(response.text, /Error:|at Object\.|stack trace/i);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 12 - Active Resident Can Be Deactivated Through the Interface
// ---------------------------------------------------------------------------

test("Test 12 - Active resident can be deactivated through the interface", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const saved = repository.save(makeValidResident({
      firstName: "Lita",
      lastName: "Reyes",
      status: Resident.Status.ACTIVE
    }));

    assert.equal(saved.status, Resident.Status.ACTIVE);

    const response = await request(app)
      .post(`/residents/${saved.id}/deactivate`);

    // Redirects after deactivation (POST/Redirect/GET)
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /\/residents/);

    // Resident remains persisted with Inactive status
    const after = repository.findById(saved.id);
    assert.ok(after !== null);
    assert.equal(after.status, Resident.Status.INACTIVE);

    // All other fields preserved
    assert.equal(after.id, saved.id);
    assert.equal(after.firstName, "Lita");
    assert.equal(after.lastName, "Reyes");

    // Resident still appears in the management listing
    const listResponse = await request(app).get("/residents");
    assert.equal(listResponse.statusCode, 200);
    assert.match(listResponse.text, /Lita/);
    assert.match(listResponse.text, /Reyes/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 13 - Inactive Resident Remains Visible with Inactive Status
// ---------------------------------------------------------------------------

test("Test 13 - Inactive resident remains visible in listing and search with Inactive status", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const saved = repository.save(makeValidResident({
      firstName: "Lita",
      lastName: "Reyes",
      status: Resident.Status.ACTIVE
    }));

    // Deactivate via the interface
    await request(app).post(`/residents/${saved.id}/deactivate`);

    // Resident appears in the full listing showing Inactive status
    const listResponse = await request(app).get("/residents");
    assert.equal(listResponse.statusCode, 200);
    assert.match(listResponse.text, /Lita/);
    assert.match(listResponse.text, /Inactive/);

    // Resident appears in search results
    const searchResponse = await request(app).get("/residents?q=Reyes");
    assert.equal(searchResponse.statusCode, 200);
    assert.match(searchResponse.text, /Lita/);
    assert.match(searchResponse.text, /Inactive/);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});

// ---------------------------------------------------------------------------
// Test 14 - GET Requests Do Not Deactivate Residents
// ---------------------------------------------------------------------------

test("Test 14 - GET requests do not alter resident status", async () => {
  const databasePath = createTemporaryDatabasePath();
  const app = createApp(databasePath);
  const repository = new ResidentRepository(databasePath);

  try {
    const saved = repository.save(makeValidResident({
      firstName: "Pedro",
      lastName: "Cruz",
      status: Resident.Status.ACTIVE
    }));

    // GET the listing page
    await request(app).get("/residents");

    // GET the registration form
    await request(app).get("/residents/new");

    // GET the edit form
    await request(app).get(`/residents/${saved.id}/edit`);

    // Resident status must remain unchanged after all GET requests
    const after = repository.findById(saved.id);
    assert.equal(after.status, Resident.Status.ACTIVE);
  } finally {
    repository.close();
    removeDatabase(databasePath);
  }
});
