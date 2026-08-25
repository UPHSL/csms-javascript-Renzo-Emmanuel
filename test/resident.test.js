import assert from "node:assert/strict";
import test from "node:test";

import { Resident } from "../src/models/Resident.js";

const validResidentInfo = {
  id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  firstName: "Juan",
  lastName: "Cruz",
  address: "123 Mabini Street, Quezon City",
  contactNumber: "09171234567",
  email: "juan.cruz@example.com",
  status: "Active",
};

test("Resident can be created using valid resident information", () => {
  const resident = new Resident(validResidentInfo);

  assert.equal(resident.id, validResidentInfo.id);
  assert.equal(resident.firstName, validResidentInfo.firstName);
  assert.equal(resident.lastName, validResidentInfo.lastName);
  assert.equal(resident.address, validResidentInfo.address);
  assert.equal(resident.contactNumber, validResidentInfo.contactNumber);
  assert.equal(resident.email, validResidentInfo.email);
  assert.equal(resident.status, validResidentInfo.status);
});

test("Resident information can be assigned and retrieved correctly", () => {
  const resident = new Resident({
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    firstName: "Maria",
    lastName: "Santos",
    address: "456 Rizal Avenue, Manila",
    contactNumber: "09281234567",
    email: "maria.santos@example.com",
    status: Resident.Status.ACTIVE,
  });

  assert.equal(resident.id, "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  assert.equal(resident.firstName, "Maria");
  assert.equal(resident.lastName, "Santos");
  assert.equal(resident.address, "456 Rizal Avenue, Manila");
  assert.equal(resident.contactNumber, "09281234567");
  assert.equal(resident.email, "maria.santos@example.com");
  assert.equal(resident.status, Resident.Status.ACTIVE);
});

test("Resident can represent Active status", () => {
  const resident = new Resident(validResidentInfo);

  assert.equal(resident.status, "Active");
  assert.equal(resident.status, Resident.Status.ACTIVE);
});
