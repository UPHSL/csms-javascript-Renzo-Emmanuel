/**
 * Application query service for Service Request listing, viewing,
 * searching, and filtering (T11).
 *
 * This service is the single entry point for all read-only Service Request
 * query operations. It coordinates three concerns:
 *
 *   1. Input normalization  — trim search terms, treat blank as list-all.
 *   2. Status validation    — reject unsupported non-empty status filters
 *                             before touching the database.
 *   3. Repository dispatch  — delegate the actual query to the repository
 *                             so no raw SQL lives in this layer.
 *
 * Responsibilities:
 *   listServiceRequests()                     — all persisted requests, ordered.
 *   viewServiceRequest(id)                    — one request by id, or null.
 *   searchServiceRequests(searchTerm, status) — filtered/searched results.
 *
 * This service does NOT:
 *   - Manage Service Request status transitions (that is T10's job).
 *   - Submit new Service Requests (that is T09's job).
 *   - Modify any persisted data — every operation here is read-only.
 *   - Contain SQL — all database access goes through the repository.
 *
 * searchServiceRequests() returns a plain result object:
 *
 *   success           {boolean}          — true when the query executed normally
 *   unsupportedStatus {boolean}          — true when an unrecognised status was given
 *   results           {ServiceRequest[]} — matching records, or [] for no match
 *
 * The two outcomes are mutually exclusive:
 *   success=true  → results holds the (possibly empty) matching array
 *   success=false → unsupportedStatus=true, results is []
 */

/**
 * The four status values recognised by T10.
 * Any non-empty value outside this set is unsupported.
 */
const SUPPORTED_STATUSES = new Set([
  "Pending",
  "In Progress",
  "Completed",
  "Cancelled",
]);

export class ServiceRequestQueryService {
  /**
   * @param {ServiceRequestRepository} repository - The Service Request
   *   persistence layer. Must expose findAll(), findById(), and search().
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Return all persisted Service Requests in deterministic order.
   *
   * Order: dateRequested DESC, then id DESC.
   * Returns an empty array when no records exist — never null.
   *
   * @returns {ServiceRequest[]}
   */
  listServiceRequests() {
    return this.repository.findAll();
  }

  /**
   * Retrieve one Service Request by its persisted identifier.
   *
   * Reuses the T09 findById() capability from the repository; no
   * separate persistence mechanism is introduced for viewing.
   *
   * @param {number} id - The Service Request's database identifier.
   * @returns {ServiceRequest|null} The matching request, or null when the
   *   id does not exist. A missing id is a normal result — no exception
   *   is thrown and no new record is created.
   */
  viewServiceRequest(id) {
    return this.repository.findById(id);
  }

  /**
   * Search and/or filter Service Requests.
   *
   * Input handling:
   *   - Leading and trailing whitespace is stripped from searchTerm.
   *   - A blank (empty or whitespace-only) searchTerm with no status filter
   *     behaves identically to listServiceRequests().
   *   - A blank searchTerm with a valid status filter returns all requests
   *     with that status.
   *   - A non-empty status that is not one of the four supported values
   *     returns success=false, unsupportedStatus=true without querying.
   *
   * Search behaviour (when searchTerm is non-blank):
   *   - Partial matching: "clear" matches "Barangay Clearance".
   *   - Case-insensitive: "CLEARANCE" matches "Clearance".
   *   - Covers serviceType OR description (not id, residentId, date, status).
   *   - A request matching both fields appears only once (DISTINCT in SQL).
   *
   * The actual filtering is performed entirely at the persistence layer
   * through parameterized queries — no in-memory filtering is done here.
   *
   * @param {string} searchTerm    - Raw search input from the caller.
   * @param {string} [statusFilter] - Optional status to filter by.
   * @returns {{
   *   success: boolean,
   *   unsupportedStatus: boolean,
   *   results: ServiceRequest[]
   * }}
   */
  searchServiceRequests(searchTerm, statusFilter) {
    // --- Normalize inputs ---
    const trimmedTerm = (searchTerm ?? "").trim();
    const trimmedStatus = (statusFilter ?? "").trim();

    // --- Validate status filter when one is provided ---
    if (trimmedStatus !== "" && !SUPPORTED_STATUSES.has(trimmedStatus)) {
      return {
        success: false,
        unsupportedStatus: true,
        results: [],
      };
    }

    // --- Blank term + no status → identical to listServiceRequests() ---
    if (trimmedTerm === "" && trimmedStatus === "") {
      return {
        success: true,
        unsupportedStatus: false,
        results: this.repository.findAll(),
      };
    }

    // --- At least one of term / status is active → persistence-level query ---
    return {
      success: true,
      unsupportedStatus: false,
      results: this.repository.search(trimmedTerm, trimmedStatus),
    };
  }
}
