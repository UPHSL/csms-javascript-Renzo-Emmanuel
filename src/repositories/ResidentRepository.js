/**
 * Persistence layer for Resident records (T03).
 *
 * Responsibility: store and retrieve Resident information using a
 * file-backed SQLite database. This class does NOT validate Residents
 * (that is T02's ResidentValidator) and does NOT deal with HTTP or UI.
 *
 * The repository is given a database file path. It opens its own
 * connection through the shared database module, which also makes sure
 * the "residents" table exists. Because the data lives in a SQLite file,
 * a brand-new repository instance pointed at the same file can read
 * records saved by a previous instance.
 */

import { createConnection, DEFAULT_DATABASE_PATH } from "../database/database.js";
import { Resident } from "../models/Resident.js";

export class ResidentRepository {
  /**
   * @param {string} databasePath - Path to the SQLite database file.
   *   Defaults to the application's runtime database.
   */
  constructor(databasePath = DEFAULT_DATABASE_PATH) {
    this.connection = createConnection(databasePath);
  }

  /**
   * Store a Resident in the database.
   *
   * SQLite generates the identifier (id is AUTOINCREMENT), so the id is
   * read back from the insert result and returned on a new Resident that
   * carries the same information plus the generated id.
   *
   * @param {Resident} resident - A valid Resident to store.
   * @returns {Resident} The stored Resident, now including its id.
   */
  save(resident) {
    const statement = this.connection.prepare(
      `INSERT INTO residents
        (first_name, last_name, address, contact_number, email, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const result = statement.run(
      resident.firstName,
      resident.lastName,
      resident.address,
      resident.contactNumber,
      resident.email,
      resident.status
    );

    // SQLite returns the generated primary key as lastInsertRowid.
    return new Resident({
      id: Number(result.lastInsertRowid),
      firstName: resident.firstName,
      lastName: resident.lastName,
      address: resident.address,
      contactNumber: resident.contactNumber,
      email: resident.email,
      status: resident.status
    });
  }

  /**
   * Retrieve a Resident by its identifier.
   *
   * @param {number} residentId - The Resident's database identifier.
   * @returns {Resident|null} The matching Resident, or null if none exists.
   */
  findById(residentId) {
    const statement = this.connection.prepare(
      `SELECT id, first_name, last_name, address, contact_number, email, status
         FROM residents
        WHERE id = ?`
    );

    const row = statement.get(residentId);

    // node:sqlite returns undefined when no row matches. A missing
    // Resident must be reported as null, never a fake or unrelated record.
    if (row === undefined) {
      return null;
    }

    return this.#mapRowToResident(row);
  }

  /**
   * Retrieve all persisted Residents ordered by last name, first name, then id.
   *
   * @returns {Resident[]} All stored Residents in deterministic order.
   */
  findAll() {
    const statement = this.connection.prepare(
      `SELECT id, first_name, last_name, address, contact_number, email, status
         FROM residents
        ORDER BY LOWER(last_name) ASC, LOWER(first_name) ASC, id ASC`
    );

    return statement.all().map(row => this.#mapRowToResident(row));
  }

  /**
   * Search Residents by partial, case-insensitive first or last name.
   *
   * The search is performed entirely at the database level using a
   * parameterized LIKE query. No in-memory filtering is done.
   *
   * @param {string} term - The trimmed, non-blank search term.
   * @returns {Resident[]} Matching Residents in deterministic order.
   */
  findByName(term) {
    const pattern = `%${term}%`;
    const statement = this.connection.prepare(
      `SELECT DISTINCT id, first_name, last_name, address, contact_number, email, status
         FROM residents
        WHERE LOWER(first_name) LIKE LOWER(?)
           OR LOWER(last_name) LIKE LOWER(?)
        ORDER BY LOWER(last_name) ASC, LOWER(first_name) ASC, id ASC`
    );

    return statement.all(pattern, pattern).map(row => this.#mapRowToResident(row));
  }

  /**
   * Update the permitted fields of an existing Resident.
   *
   * Only firstName, lastName, address, contactNumber, and email are
   * modified. The id and status columns are never touched by this method.
   * The UPDATE is bounded by WHERE id = ? so only the targeted Resident
   * row is affected.
   *
   * @param {Resident} resident - The Resident carrying the updated values
   *   and the existing id.
   * @returns {Resident} The updated Resident as read back from persistence.
   */
  update(resident) {
    const statement = this.connection.prepare(
      `UPDATE residents
          SET first_name = ?, last_name = ?, address = ?, contact_number = ?, email = ?
        WHERE id = ?`
    );

    statement.run(
      resident.firstName,
      resident.lastName,
      resident.address,
      resident.contactNumber,
      resident.email,
      resident.id
    );

    return this.findById(resident.id);
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
   * Convert a raw SQLite row into a Resident domain object.
   *
   * The database columns use snake_case (first_name) while the domain
   * model uses camelCase (firstName), so the names are mapped here.
   *
   * @param {object} row - A row from the residents table.
   * @returns {Resident} The reconstructed Resident.
   */
  #mapRowToResident(row) {
    return new Resident({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      address: row.address,
      contactNumber: row.contact_number,
      email: row.email,
      status: row.status
    });
  }
}
