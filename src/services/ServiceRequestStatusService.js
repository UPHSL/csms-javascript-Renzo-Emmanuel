/**
 * Manages the processing lifecycle of an existing ServiceRequest (T10).
 *
 * This service is the single entry point for changing the status of a
 * ServiceRequest that was already persisted by T09. It enforces the
 * controlled transition workflow before any persistence change occurs.
 *
 * Responsibilities:
 *   1. Retrieve the existing ServiceRequest from persistence.
 *   2. Reject unknown Service Request IDs (not-found).
 *   3. Reject unsupported target status values.
 *   4. Enforce the allowed transition rules (including terminal states
 *      and same-status requests).
 *   5. Delegate the status UPDATE to the repository only when all checks pass.
 *   6. Return a structured result so the caller can distinguish every outcome.
 *
 * This service does NOT:
 *   - Create new ServiceRequests (that is T09's job).
 *   - Check whether the associated Resident is still Active — T10 manages
 *     existing transactions; Resident eligibility only applies at submission.
 *   - Put transition logic inside the repository.
 *   - Expose itself through a controller or route.
 *
 * Every call to manageStatus() returns a plain result object with five fields:
 *
 *   success           {boolean}              — true only when the transition was persisted
 *   notFound          {boolean}              — true when the id has no matching record
 *   unsupportedStatus {boolean}              — true when the requested status is not recognized
 *   invalidTransition {boolean}              — true when the transition is not allowed
 *                                              (includes same-status and terminal-state attempts)
 *   serviceRequest    {ServiceRequest|null}  — the updated persisted request, or null
 *
 * The four failure outcomes are mutually exclusive.
 */

/**
 * The four status values supported by T10.
 * Anything outside this set is an unsupported status.
 */
const SUPPORTED_STATUSES = new Set([
  "Pending",
  "In Progress",
  "Completed",
  "Cancelled",
]);

/**
 * Allowed transitions map.
 *
 * Key   — the current persisted status.
 * Value — Set of statuses the request may move to from the current status.
 *
 * Terminal states (Completed, Cancelled) map to empty sets, which means
 * no transition away from them is permitted.
 *
 * Same-status requests are NOT included in any set, so they fall through
 * to the invalidTransition result.
 */
const ALLOWED_TRANSITIONS = new Map([
  ["Pending",     new Set(["In Progress", "Cancelled"])],
  ["In Progress", new Set(["Completed",   "Cancelled"])],
  ["Completed",   new Set()],
  ["Cancelled",   new Set()],
]);

export class ServiceRequestStatusService {
  /**
   * @param {ServiceRequestRepository} serviceRequestRepository - Persistence
   *   layer for ServiceRequest records. Must expose findById() and updateStatus().
   */
  constructor(serviceRequestRepository) {
    this.serviceRequestRepository = serviceRequestRepository;
  }

  /**
   * Attempt to transition a ServiceRequest to a new status.
   *
   * @param {number} serviceRequestId - The id of the ServiceRequest to update.
   * @param {string} requestedStatus  - The desired target status.
   * @returns {{
   *   success: boolean,
   *   notFound: boolean,
   *   unsupportedStatus: boolean,
   *   invalidTransition: boolean,
   *   serviceRequest: ServiceRequest|null
   * }}
   */
  manageStatus(serviceRequestId, requestedStatus) {
    // --- Step 1: retrieve the existing record ---
    const existing = this.serviceRequestRepository.findById(serviceRequestId);

    if (existing === null) {
      return {
        success: false,
        notFound: true,
        unsupportedStatus: false,
        invalidTransition: false,
        serviceRequest: null,
      };
    }

    // --- Step 2: reject unsupported target status values ---
    if (!SUPPORTED_STATUSES.has(requestedStatus)) {
      return {
        success: false,
        notFound: false,
        unsupportedStatus: true,
        invalidTransition: false,
        serviceRequest: null,
      };
    }

    // --- Step 3: enforce transition rules ---
    // Looks up the set of allowed next statuses for the current status.
    // Same-status requests are not in any allowed set, so they reach this
    // branch and are returned as invalidTransition.
    const allowedNext = ALLOWED_TRANSITIONS.get(existing.status);

    if (!allowedNext || !allowedNext.has(requestedStatus)) {
      return {
        success: false,
        notFound: false,
        unsupportedStatus: false,
        invalidTransition: true,
        serviceRequest: null,
      };
    }

    // --- Step 4: persist the valid transition ---
    // updateStatus() runs the parameterized UPDATE and returns the refreshed
    // ServiceRequest so the caller receives the final persisted state.
    const updated = this.serviceRequestRepository.updateStatus(
      serviceRequestId,
      requestedStatus
    );

    return {
      success: true,
      notFound: false,
      unsupportedStatus: false,
      invalidTransition: false,
      serviceRequest: updated,
    };
  }
}
