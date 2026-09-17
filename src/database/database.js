/**
 * Database connection and schema initialization for the CSMS.
 *
 * T03 uses the Node.js built-in SQLite module (node:sqlite) with a
 * file-backed database. This module has a single responsibility:
 * open a connection to a given database file and make sure the
 * "residents" table exists before it is used.
 *
 * The database file path is injected (passed in) rather than hard-coded
 * in several places. This lets the running application use one location
 * while automated tests use a separate temporary database file.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Default database file used when the application runs normally.
 *
 * The "data/" directory is git-ignored so this runtime file is never
 * committed to the repository.
 */
export const DEFAULT_DATABASE_PATH = "data/csms.sqlite";

/**
 * SQL that creates the Resident table only when it does not already exist.
 *
 * Design notes:
 * - id is an INTEGER PRIMARY KEY AUTOINCREMENT so SQLite generates the
 *   identifier for every new Resident.
 * - contact_number is stored as TEXT so a leading zero (for example in
 *   "09171234567") is preserved and never treated as a number.
 * - The required text fields use NOT NULL to reject missing values.
 * - "IF NOT EXISTS" makes initialization repeatable: running it many
 *   times will not drop data, duplicate the table, or fail.
 */
const CREATE_RESIDENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS residents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    address TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL
  )
`;

/**
 * Open a connection to the SQLite database at the given path and ensure
 * the Resident table exists.
 *
 * @param {string} databasePath - Path to the SQLite database file.
 * @returns {DatabaseSync} An open database connection ready for use.
 */
export function createConnection(databasePath = DEFAULT_DATABASE_PATH) {
  // Make sure the folder that will hold the database file exists.
  // (An in-memory database such as ":memory:" has no directory.)
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const connection = new DatabaseSync(databasePath);

  // Ensure the schema exists. Safe to run every time a connection opens.
  connection.exec(CREATE_RESIDENTS_TABLE);

  return connection;
}
