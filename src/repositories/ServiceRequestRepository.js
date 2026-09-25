/**
 * Persistence layer for ServiceRequest records (T09).
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
