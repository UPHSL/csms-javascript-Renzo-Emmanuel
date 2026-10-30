/**
 * Persistence layer for ServiceRequest records (T09, T10, T11).
 *
 * Responsibility: store and retrieve ServiceRequest data using the same
 * file-backed SQLite database as ResidentRepository. This class does NOT
 * validate service requests (that is ServiceRequestValidator's job) and
 * does NOT check whether the referenced Resident exists or is Active
 * (that belongs in ServiceRequestSubmissionService).
 *
 * The repository is given a database file path. It opens its own
 * connection through the shared database module, which also ensures both
 * the "residents" and "service_requests" tables exist before use.
 *
 * T11 adds two read-only query methods:
 *   findAll()            — list every persisted ServiceRequest in
 *                          deterministic order (dateRequested DESC, id DESC).
 *   search(term, status) — filter by partial text and/or status at the
 *                          database level; never loads all rows into memory
 *                          for application-side filtering.
 */

import { createConnection, DEFAULT_DATABASE_PATH } from "../database/database.js";
import { ServiceRequest } from "../models/ServiceRequest.js";

export class ServiceRequestRepository {
  /**
   * @param {string} databasePath - Path to the SQLite database file.
   *   Defaults to the application's runtime database.
   */
  constructor(databasePath = DEFAULT_DATABASE_PATH) {
    this.connection = createConnection(databasePath);
  }

  /**
   * Store a ServiceRequest in the database.
   *
   * SQLite generates the identifier (id is AUTOINCREMENT), so the id is
   * read back from the insert result and returned on a new ServiceRequest
   * that carries all the same information plus the generated id.
   *
   * @param {ServiceRequest} serviceRequest - A validated ServiceRequest to store.
   * @returns {ServiceRequest} The stored request, now including its id.
   */
  save(serviceRequest) {
    const statement = this.connection.prepare(
      `INSERT INTO service_requests
        (resident_id, service_type, description, date_requested, status)
       VALUES (?, ?, ?, ?, ?)`
    );

    const result = statement.run(
      serviceRequest.residentId,
      serviceRequest.serviceType,
      serviceRequest.description,
      serviceRequest.dateRequested,
      serviceRequest.status
    );

    // SQLite returns the generated primary key as lastInsertRowid.
    return new ServiceRequest({
      id: Number(result.lastInsertRowid),
      residentId: serviceRequest.residentId,
      serviceType: serviceRequest.serviceType,
      description: serviceRequest.description,
      dateRequested: serviceRequest.dateRequested,
      status: serviceRequest.status
    });
  }

  /**
   * Retrieve a ServiceRequest by its identifier.
   *
   * @param {number} id - The ServiceRequest's database identifier.
   * @returns {ServiceRequest|null} The matching request, or null if none exists.
   */
  findById(id) {
    const statement = this.connection.prepare(
      `SELECT id, resident_id, service_type, description, date_requested, status
         FROM service_requests
        WHERE id = ?`
    );

    const row = statement.get(id);

    // node:sqlite returns undefined when no row matches.
    if (row === undefined) {
      return null;
    }

    return this.#mapRowToServiceRequest(row);
  }

  /**
   * Update the status of an existing ServiceRequest.
   *
   * The repository's only responsibility here is executing the SQL. It does
   * NOT decide whether the transition is valid — that belongs in
   * ServiceRequestStatusService. The caller must ensure the transition is
   * allowed before invoking this method.
   *
   * @param {number} id - The id of the ServiceRequest to update.
   * @param {string} status - The new status value to persist.
   * @returns {ServiceRequest|null} The updated ServiceRequest as read back
   *   from the database, or null if no row with that id exists.
   */
  updateStatus(id, status) {
    const statement = this.connection.prepare(
      `UPDATE service_requests
          SET status = ?
        WHERE id = ?`
    );

    statement.run(status, id);

    // Read the row back so the caller always receives a fully mapped
    // ServiceRequest rather than having to call findById separately.
    return this.findById(id);
  }

  /**
   * Retrieve all persisted ServiceRequests in deterministic order.
   *
   * Results are ordered by dateRequested DESC first so newer requests
   * appear before older ones. When two requests share the same date, the
   * one with the higher id appears first (id DESC). This ordering applies
   * consistently to listing, searching, and filtering results.
   *
   * @returns {ServiceRequest[]} All stored ServiceRequests in required order.
   *   Returns an empty array when no records exist — never null.
   */
  findAll() {
    const statement = this.connection.prepare(
      `SELECT id, resident_id, service_type, description, date_requested, status
         FROM service_requests
        ORDER BY date_requested DESC, id DESC`
    );

    return statement.all().map(row => this.#mapRowToServiceRequest(row));
  }

  /**
   * Search and/or filter persisted ServiceRequests at the database level.
   *
   * Text search covers serviceType and description only (OR match).
   * A partial, case-insensitive LIKE query is used so "clear" matches
   * "Barangay Clearance". SELECT DISTINCT prevents a request that matches
   * both fields from appearing more than once.
   *
   * When term is a non-blank string, the WHERE clause includes the text
   * condition. When status is also provided, an AND status = ? clause is
   * appended. When only status is provided (term is blank), only the
   * status filter applies. At least one of term or status must be non-blank
   * before calling this method — a caller that wants all records should
   * use findAll() instead.
   *
   * All filtering and ordering happen inside SQLite; no application-side
   * array filtering is performed.
   *
   * @param {string} term   - Trimmed, possibly blank search term.
   * @param {string} status - Exact status value to filter by, or empty
   *   string / null / undefined for no status filter.
   * @returns {ServiceRequest[]} Matching ServiceRequests in required order.
   *   Returns an empty array when no records match — never null.
   */
  search(term, status) {
    const hasText   = term   !== "" && term   != null;
    const hasStatus = status !== "" && status != null;

    let sql;
    let params;

    if (hasText && hasStatus) {
      // Both text search and status filter active.
      const pattern = `%${term}%`;
      sql =
        `SELECT DISTINCT id, resident_id, service_type, description, date_requested, status
           FROM service_requests
          WHERE (LOWER(service_type) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))
            AND status = ?
          ORDER BY date_requested DESC, id DESC`;
      params = [pattern, pattern, status];

    } else if (hasText) {
      // Text search only; all statuses included.
      const pattern = `%${term}%`;
      sql =
        `SELECT DISTINCT id, resident_id, service_type, description, date_requested, status
           FROM service_requests
          WHERE LOWER(service_type) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?)
          ORDER BY date_requested DESC, id DESC`;
      params = [pattern, pattern];

    } else {
      // Status filter only; no text restriction.
      sql =
        `SELECT id, resident_id, service_type, description, date_requested, status
           FROM service_requests
          WHERE status = ?
          ORDER BY date_requested DESC, id DESC`;
      params = [status];
    }

    const statement = this.connection.prepare(sql);
    return statement.all(...params).map(row => this.#mapRowToServiceRequest(row));
  }

  /**
   * Close the underlying database connection.
   *
   * Useful for releasing the SQLite file, especially in tests that create
   * and then delete temporary database files.
   */
  close() {
    this.connection.close();
  }

  /**
   * Convert a raw SQLite row into a ServiceRequest domain object.
   *
   * The database columns use snake_case (resident_id, service_type, etc.)
   * while the domain model uses camelCase (residentId, serviceType, etc.),
   * so the names are mapped here.
   *
   * @param {object} row - A row from the service_requests table.
   * @returns {ServiceRequest} The reconstructed ServiceRequest.
   */
  #mapRowToServiceRequest(row) {
    return new ServiceRequest({
      id: row.id,
      residentId: row.resident_id,
      serviceType: row.service_type,
      description: row.description,
      dateRequested: row.date_requested,
      status: row.status
    });
  }
}
