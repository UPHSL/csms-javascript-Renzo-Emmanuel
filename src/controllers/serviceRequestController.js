/**
 * Presentation layer controller for Service Request Management (T13).
 *
 * Responsibility: receive HTTP requests, call the appropriate application
 * service from T09-T11, and render the result through EJS views.
 *
 * This controller does NOT contain business logic, validation rules, or SQL.
 * All of those responsibilities remain in the services and repositories
 * established in T08-T11.
 */

import { ServiceRequest } from "../models/ServiceRequest.js";
import { ServiceRequestRepository } from "../repositories/ServiceRequestRepository.js";
import { ServiceRequestValidator } from "../services/ServiceRequestValidator.js";
import { ServiceRequestQueryService } from "../services/ServiceRequestQueryService.js";
import { ServiceRequestSubmissionService } from "../services/ServiceRequestSubmissionService.js";
import { ServiceRequestStatusService } from "../services/ServiceRequestStatusService.js";
import { ResidentRepository } from "../repositories/ResidentRepository.js";

/**
 * Map a field-name error token to a human-readable message for the form.
 *
 * @param {string} field - A field name such as "serviceType".
 * @returns {string} A user-facing validation message.
 */
function toErrorMessage(field) {
  const messages = {
    residentId: "Resident ID is required and must be a valid number.",
    serviceType: "Service type is required.",
    description: "Description is required.",
    dateRequested: "Date requested is required and must be a valid date (YYYY-MM-DD).",
    status: "Status is invalid.",
    residentNotFound: "Resident not found.",
    residentInactive: "Inactive Residents cannot submit new Service Requests."
  };
  return messages[field] ?? `${field} is invalid.`;
}

/**
 * GET /service-requests
 *
 * List all Service Requests, with optional text search and status filter.
 * Uses T11 ServiceRequestQueryService so ordering and search behavior
 * are preserved from the backend.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function listServiceRequests(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ServiceRequestRepository(databasePath);

  try {
    const queryService = new ServiceRequestQueryService(repository);

    const searchTerm = (request.query.q ?? "").trim();
    const rawStatus = (request.query.status ?? "").trim();
    // Treat "all" sentinel value or blank as no status filter.
    const selectedStatus = rawStatus === "all" ? "" : rawStatus;

    const queryResult = queryService.searchServiceRequests(searchTerm, selectedStatus);

    // If an unsupported status was passed (e.g. tampered URL), redirect cleanly.
    if (!queryResult.success) {
      response.redirect("/service-requests");
      return;
    }

    // Success message is passed via query param after a POST/Redirect/GET.
    const successParam = request.query.success ?? "";
    let successMessage = "";
    if (successParam === "submitted")  successMessage = "Service Request submitted successfully.";
    if (successParam === "processed")  successMessage = "Service Request is now In Progress.";
    if (successParam === "completed")  successMessage = "Service Request completed successfully.";
    if (successParam === "cancelled")  successMessage = "Service Request cancelled successfully.";

    response.status(200).render("service-requests/index", {
      serviceRequests: queryResult.results,
      searchTerm,
      selectedStatus: rawStatus === "" ? "all" : rawStatus,
      successMessage
    });
  } finally {
    repository.close();
  }
}

/**
 * GET /service-requests/new
 *
 * Render the blank Service Request submission form.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function showSubmissionForm(request, response) {
  response.status(200).render("service-requests/new", {
    errors: [],
    formData: {}
  });
}

/**
 * POST /service-requests
 *
 * Submit the Service Request form.
 * On success: redirect to /service-requests (POST/Redirect/GET).
 * On failure: re-render the form with errors and preserved input.
 *
 * Uses T09 ServiceRequestSubmissionService which delegates to T09
 * ServiceRequestValidator and checks Resident existence/eligibility.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function submitServiceRequest(request, response) {
  const databasePath = request.app.locals.databasePath;
  const srRepository = new ServiceRequestRepository(databasePath);
  const residentRepository = new ResidentRepository(databasePath);

  try {
    const validator = new ServiceRequestValidator();
    const service = new ServiceRequestSubmissionService(
      validator,
      srRepository,
      residentRepository
    );

    const { residentId, serviceType, description, dateRequested } = request.body;

    const candidate = new ServiceRequest({
      id: null,
      residentId: Number(residentId),
      serviceType: serviceType ?? "",
      description: description ?? "",
      dateRequested: dateRequested ?? "",
      status: ServiceRequest.Status.PENDING
    });

    const result = service.submitServiceRequest(candidate);

    if (result.success) {
      response.redirect("/service-requests?success=submitted");
      return;
    }

    // Build errors array for the view.
    let errors = result.errors;
    if (result.residentNotFound) errors = ["residentNotFound"];
    if (result.residentInactive) errors = ["residentInactive"];

    response.status(422).render("service-requests/new", {
      errors,
      formData: request.body
    });
  } finally {
    srRepository.close();
    residentRepository.close();
  }
}

/**
 * GET /service-requests/:id
 *
 * View the details of one Service Request.
 * Returns a 404 page when the requested Service Request does not exist.
 *
 * Uses T11 ServiceRequestQueryService.viewServiceRequest().
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function viewServiceRequest(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ServiceRequestRepository(databasePath);

  try {
    const id = Number(request.params.id);
    const queryService = new ServiceRequestQueryService(repository);
    const serviceRequest = queryService.viewServiceRequest(id);

    if (serviceRequest === null) {
      response.status(404).render("404", {
        message: "Service Request not found."
      });
      return;
    }

    // Success message passed via query param after a workflow action redirect.
    const successParam = request.query.success ?? "";
    let successMessage = "";
    if (successParam === "processed")  successMessage = "Service Request is now In Progress.";
    if (successParam === "completed")  successMessage = "Service Request completed successfully.";
    if (successParam === "cancelled")  successMessage = "Service Request cancelled successfully.";

    response.status(200).render("service-requests/show", {
      serviceRequest,
      successMessage
    });
  } finally {
    repository.close();
  }
}

/**
 * POST /service-requests/:id/process
 *
 * Transition a Pending Service Request to In Progress.
 * Uses T10 ServiceRequestStatusService — it enforces the transition rules.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function startProcessing(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ServiceRequestRepository(databasePath);

  try {
    const id = Number(request.params.id);
    const service = new ServiceRequestStatusService(repository);
    const result = service.manageStatus(id, ServiceRequest.Status.IN_PROGRESS);

    if (result.success) {
      response.redirect(`/service-requests/${id}?success=processed`);
      return;
    }

    if (result.notFound) {
      response.status(404).render("404", {
        message: "Service Request not found."
      });
      return;
    }

    // invalidTransition or unsupportedStatus — redirect back without change.
    response.redirect(`/service-requests/${id}`);
  } finally {
    repository.close();
  }
}

/**
 * POST /service-requests/:id/complete
 *
 * Transition an In Progress Service Request to Completed.
 * Uses T10 ServiceRequestStatusService.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function completeRequest(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ServiceRequestRepository(databasePath);

  try {
    const id = Number(request.params.id);
    const service = new ServiceRequestStatusService(repository);
    const result = service.manageStatus(id, ServiceRequest.Status.COMPLETED);

    if (result.success) {
      response.redirect(`/service-requests/${id}?success=completed`);
      return;
    }

    if (result.notFound) {
      response.status(404).render("404", {
        message: "Service Request not found."
      });
      return;
    }

    response.redirect(`/service-requests/${id}`);
  } finally {
    repository.close();
  }
}

/**
 * POST /service-requests/:id/cancel
 *
 * Transition a Pending or In Progress Service Request to Cancelled.
 * Uses T10 ServiceRequestStatusService.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function cancelRequest(request, response) {
  const databasePath = request.app.locals.databasePath;
  const repository = new ServiceRequestRepository(databasePath);

  try {
    const id = Number(request.params.id);
    const service = new ServiceRequestStatusService(repository);
    const result = service.manageStatus(id, ServiceRequest.Status.CANCELLED);

    if (result.success) {
      response.redirect(`/service-requests/${id}?success=cancelled`);
      return;
    }

    if (result.notFound) {
      response.status(404).render("404", {
        message: "Service Request not found."
      });
      return;
    }

    response.redirect(`/service-requests/${id}`);
  } finally {
    repository.close();
  }
}

export { toErrorMessage };
