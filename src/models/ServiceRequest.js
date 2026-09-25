/**
 * Represents a service request submitted by a Resident (T09).
 *
 * A ServiceRequest captures what a Resident needs from the community
 * management office. It starts with a null id (no database identifier
 * yet) and a status of "Pending" until it is persisted and processed.
 */
export class ServiceRequest {
  /**
   * Create a new ServiceRequest instance.
   *
   * @param {object} info - The service request information.
   * @param {number|null} [info.id] - Unique identifier. Defaults to null
   *   so a newly created request has no identifier until the persistence
   *   layer assigns one.
   * @param {number} info.residentId - The id of the Resident who is
   *   submitting the request.
   * @param {string} info.serviceType - The category or type of service
   *   being requested.
   * @param {string} info.description - A detailed description of what
   *   is needed.
   * @param {string} info.dateRequested - The date the request is made,
   *   as a YYYY-MM-DD string.
   * @param {string} [info.status] - Processing status. Defaults to
   *   "Pending" for every new request.
   */
  constructor({
    id = null,
    residentId,
    serviceType,
    description,
    dateRequested,
    status = "Pending"
  }) {
    this.id = id;
    this.residentId = residentId;
    this.serviceType = serviceType;
    this.description = description;
    this.dateRequested = dateRequested;
    this.status = status;
  }
}
