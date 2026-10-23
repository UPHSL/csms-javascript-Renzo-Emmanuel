/**
 * Presentation layer controller for Resident Management (T12).
 *
 * Responsibility: receive HTTP requests, call the appropriate application
 * service from T04-T07, and render the result through EJS views.
 *
 * This controller does NOT contain business logic, validation rules, or SQL.
 * All of those responsibilities remain in the services and repositories
 * established in T02-T07.
 */

import { Resident } from "../models/Resident.js";
import { ResidentRepository } from "../repositories/ResidentRepository.js";
import { ResidentValidator } from "../services/ResidentValidator.js";
import { ResidentService } from "../services/ResidentService.js";
import { ResidentRegistrationService } from "../services/ResidentRegistrationService.js";
import { ResidentUpdateService } from "../services/ResidentUpdateService.js";
import { ResidentDeactivationService } from "../services/ResidentDeactivationService.js";

/**
 * Map a field-name error token returned by ResidentValidator to a
 * human-readable message displayed in the form.
 *
 * @param {string} field - A field name such as "firstName".
 * @returns {string} A user-facing validation message.
 */
function toErrorMessage(field) {
  const messages = {
    firstName: "First name is required.",
    lastName: "Last name is required.",
    address: "Address is required.",
    contactNumber: "Contact number must follow the format 09XXXXXXXXX.",
    email: "Email address is invalid.",
    status: "Status is invalid."
  };
  return messages[field] ?? `${field} is invalid.`;
}

/**
 * GET /residents
 *
 * List all Residents or search by name when a query term is supplied.
 * Uses T05 ResidentService so ordering and search behavior are unchanged.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function listResidents(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ResidentRepository(databasePath);

  try {
    const service = new ResidentService(repository);
    const searchTerm = (request.query.q ?? "").trim();
    const residents = searchTerm
      ? service.searchResidents(searchTerm)
      : service.listResidents();

    // Success message is passed via query param after a POST/Redirect/GET.
    const successParam = request.query.success ?? "";
    let successMessage = "";
    if (successParam === "registered") successMessage = "Resident registered successfully.";
    if (successParam === "updated") successMessage = "Resident information updated successfully.";
    if (successParam === "deactivated") successMessage = "Resident deactivated successfully.";

    response.status(200).render("residents/index", {
      residents,
      searchTerm,
      successMessage
    });
  } finally {
    repository.close();
  }
}

/**
 * GET /residents/new
 *
 * Render the blank Resident registration form.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function showRegistrationForm(request, response) {
  response.status(200).render("residents/new", {
    errors: [],
    formData: {}
  });
}

/**
 * POST /residents
 *
 * Submit the Resident registration form.
 * On success: redirect to /residents (POST/Redirect/GET).
 * On failure: re-render the form with validation errors and preserved input.
 *
 * Uses T04 ResidentRegistrationService which delegates validation to T02.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function registerResident(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ResidentRepository(databasePath);

  try {
    const validator = new ResidentValidator();
    const service = new ResidentRegistrationService(validator, repository);

    const { firstName, lastName, address, contactNumber, email } = request.body;

    const candidate = new Resident({
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      address: address ?? "",
      contactNumber: contactNumber ?? "",
      email: email ?? "",
      status: Resident.Status.ACTIVE
    });

    const result = service.registerResident(candidate);

    if (result.success) {
      response.redirect("/residents?success=registered");
      return;
    }

    // Re-render the form with field-level errors and preserved values.
    response.status(422).render("residents/new", {
      errors: result.errors,
      formData: request.body
    });
  } finally {
    repository.close();
  }
}

/**
 * GET /residents/:id/edit
 *
 * Render the prefilled Resident edit form.
 * Returns a 404 page when the requested Resident does not exist.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function showEditForm(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ResidentRepository(databasePath);

  try {
    const id = Number(request.params.id);
    const resident = repository.findById(id);

    if (resident === null) {
      response.status(404).render("404", {
        message: "Resident not found."
      });
      return;
    }

    response.status(200).render("residents/edit", {
      resident,
      errors: [],
      formData: {
        firstName: resident.firstName,
        lastName: resident.lastName,
        address: resident.address,
        contactNumber: resident.contactNumber,
        email: resident.email
      }
    });
  } finally {
    repository.close();
  }
}

/**
 * POST /residents/:id/edit
 *
 * Submit the Resident edit form.
 * On success: redirect to /residents (POST/Redirect/GET).
 * On failure: re-render the form with validation errors and preserved input.
 *
 * Uses T06 ResidentUpdateService which delegates validation to T02.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function updateResident(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ResidentRepository(databasePath);

  try {
    const id = Number(request.params.id);
    const validator = new ResidentValidator();
    const service = new ResidentUpdateService(validator, repository);

    const proposedInfo = {
      firstName: request.body.firstName ?? "",
      lastName: request.body.lastName ?? "",
      address: request.body.address ?? "",
      contactNumber: request.body.contactNumber ?? "",
      email: request.body.email ?? ""
    };

    const result = service.updateResident(id, proposedInfo);

    if (result.notFound) {
      response.status(404).render("404", {
        message: "Resident not found."
      });
      return;
    }

    if (result.success) {
      response.redirect("/residents?success=updated");
      return;
    }

    // Re-render the edit form with errors and preserved values.
    // Re-fetch the resident to restore read-only fields (id, status).
    const existing = repository.findById(id);
    response.status(422).render("residents/edit", {
      resident: existing,
      errors: result.errors,
      formData: request.body
    });
  } finally {
    repository.close();
  }
}

/**
 * POST /residents/:id/deactivate
 *
 * Deactivate an Active Resident using T07 ResidentDeactivationService.
 * The Resident is soft-deactivated (status → Inactive) and remains persisted.
 * On success or already-inactive: redirect to /residents.
 * On not-found: render 404 page.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function deactivateResident(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ResidentRepository(databasePath);

  try {
    const id = Number(request.params.id);
    const service = new ResidentDeactivationService(repository);

    const result = service.deactivateResident(id);

    if (result.notFound) {
      response.status(404).render("404", {
        message: "Resident not found."
      });
      return;
    }

    // Both success and alreadyInactive redirect back to the list.
    response.redirect("/residents?success=deactivated");
  } finally {
    repository.close();
  }
}

export { toErrorMessage };
