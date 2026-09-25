/**
 * Represents a community service request associated with a Resident.
 *
 * The ServiceRequest domain model is the foundation for service request
 * submission, validation, persistence, and status management.
 */
export class ServiceRequest {
  /**
   * Possible ServiceRequest status values.
   */
  static Status = {
    PENDING: "Pending",
  };

  /**
   * Create a new ServiceRequest instance.
   *
   * @param {object} requestInfo - The service request information.
   * @param {number|null} [requestInfo.id] - Unique identifier. Defaults to
   *   null so a newly created ServiceRequest has no identifier until the
   *   persistence layer assigns one.
   * @param {number} requestInfo.residentId - ID of the associated Resident.
   * @param {string} requestInfo.serviceType - Category of service requested.
   * @param {string} requestInfo.description - Details about the request.
   * @param {string} requestInfo.dateRequested - Date of the request.
   * @param {string} [requestInfo.status] - Lifecycle status. Defaults to
   *   Pending so every new request begins in the initial state.
   */
  constructor({ id = null, residentId, serviceType, description, dateRequested, status = "Pending" }) {
    this.id = id;
    this.residentId = residentId;
    this.serviceType = serviceType;
    this.description = description;
    this.dateRequested = dateRequested;
    this.status = status;
  }
}
