/**
 * Intrinsic validation for ServiceRequest instances (T09).
 *
 * "Intrinsic" means this validator only checks the fields that belong to
 * the ServiceRequest itself. It never opens a database connection and never
 * looks up the referenced Resident. Resident existence and Active-status
 * checks are the responsibility of ServiceRequestSubmissionService.
 *
 * Returns an array of failing field names, following the same convention
 * used by ResidentValidator so callers can handle both uniformly.
 */

/**
 * YYYY-MM-DD date string pattern.
 * Matches exactly four digits, a hyphen, two digits, a hyphen, two digits.
 * Does not verify calendar correctness (e.g. month 13) — that level of
 * validation is beyond the scope of this ticket.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ServiceRequestValidator {
  /**
   * Validate a ServiceRequest and return the names of every failing field.
   *
   * @param {ServiceRequest} serviceRequest - The request to validate.
   * @returns {string[]} Array of failing field names. Empty means valid.
   */
  validate(serviceRequest) {
    const errors = [];

    // id must be null — a ServiceRequest must not already have a database
    // identifier before it is submitted for the first time.
    if (serviceRequest.id !== null) {
      errors.push("id");
    }

    // residentId must be a positive number — zero and negative values are
    // not valid database identifiers.
    if (
      typeof serviceRequest.residentId !== "number" ||
      serviceRequest.residentId <= 0
    ) {
      errors.push("residentId");
    }

    // serviceType is required and must not be blank/whitespace-only.
    if (this.#isBlank(serviceRequest.serviceType)) {
      errors.push("serviceType");
    }

    // description is required and must not be blank/whitespace-only.
    if (this.#isBlank(serviceRequest.description)) {
      errors.push("description");
    }

    // dateRequested must be a non-blank string in YYYY-MM-DD format.
    if (
      this.#isBlank(serviceRequest.dateRequested) ||
      !DATE_PATTERN.test(serviceRequest.dateRequested)
    ) {
      errors.push("dateRequested");
    }

    // status must be exactly "Pending" — no other value is valid at
    // submission time, and status transitions are not part of this ticket.
    if (serviceRequest.status !== "Pending") {
      errors.push("status");
    }

    return errors;
  }

  /**
   * Convenience method: returns true when validate() produces no errors.
   *
   * @param {ServiceRequest} serviceRequest
   * @returns {boolean}
   */
  isValid(serviceRequest) {
    return this.validate(serviceRequest).length === 0;
  }

  /**
   * Returns true when a value is not a string or is whitespace-only.
   *
   * @param {*} value
   * @returns {boolean}
   */
  #isBlank(value) {
    return typeof value !== "string" || value.trim().length === 0;
  }
}
