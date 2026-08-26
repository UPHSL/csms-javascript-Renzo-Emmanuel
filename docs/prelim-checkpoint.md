# T03 - Preliminary Examination Checkpoint

> NOTE TO SELF: Review and rewrite this in my own words before submitting.
> Fill in Name and GitHub Username below. I must be able to explain every
> section during individual verification.

## Developer Information

- **Name:** <!-- TODO: your full name -->
- **GitHub Username:** <!-- TODO: your GitHub username -->
- **Primary Technology Stack:** JavaScript with Express.js
- **T03 Branch:** feature/t03-resident-persistence

## My T03 Implementation

Resident data is stored in a file-backed SQLite database. When the
application runs normally, the database file lives at `data/csms.sqlite`
(the `data/` folder is git-ignored so the runtime database is never
committed). The class responsible for persistence is `ResidentRepository`
in `src/repositories/ResidentRepository.js`, and it opens its connection
through a small database module in `src/database/database.js`. When
`save()` is called, the repository runs a parameterized `INSERT` for the
six Resident fields; because the `id` column is `INTEGER PRIMARY KEY
AUTOINCREMENT`, SQLite generates the identifier itself. The repository
reads that generated id back from the insert result (`lastInsertRowid`)
and returns a new `Resident` that carries the same information plus the
assigned id. `findById()` runs a parameterized `SELECT` for a given id and,
if a row is found, maps the database row back into a `Resident` object; if
no row matches, it returns `null` so a missing Resident is handled safely
instead of crashing or returning the wrong record.

## My Persistence Design Decision

- **What I decided:** The database file path is *injected* into the
  repository (passed to the constructor) rather than hard-coded inside it.
  There is one default path in the database module, and tests pass their
  own temporary path.
- **Why I implemented it this way:** It keeps a single source of truth for
  the runtime path and lets the automated tests run against an isolated
  temporary database without touching the real development data. It also
  makes the "second repository instance" test straightforward, since both
  instances simply point at the same file.
- **Alternative considered:** I considered having the database module open
  the connection and injecting the live connection object into the
  repository. That works too, but it splits connection ownership across two
  places. Passing a path keeps each repository responsible for its own
  connection, which was simpler to reason about and explain.

## My Database Initialization Design

- **Database initialization file or module:** `src/database/database.js`
- **Where the database path comes from:** It is passed into
  `createConnection(databasePath)`. If nothing is passed, it defaults to
  `DEFAULT_DATABASE_PATH` (`data/csms.sqlite`). Tests pass a temporary path.
- **How the Resident table is initialized:** `createConnection()` runs a
  `CREATE TABLE IF NOT EXISTS residents (...)` statement every time a
  connection is opened.
- **How repeated initialization is handled:** The `IF NOT EXISTS` clause
  means running initialization many times does not drop data, create
  duplicate tables, or fail if the table already exists.
- **Why I designed it this way:** Centralizing connection + schema setup in
  one module avoids burying database details in `app.js` or in several
  files, and the repeatable `IF NOT EXISTS` initialization makes the
  project safe to set up and test again from scratch.

## Files I Changed

- **File:** `src/database/database.js`
  **Purpose:** Opens a SQLite connection to a given file path and ensures
  the `residents` table exists (repeatable schema initialization).

- **File:** `src/repositories/ResidentRepository.js`
  **Purpose:** The persistence layer. Stores Residents (`save`) and
  retrieves them by id (`findById`) using parameterized SQL, and maps
  database rows back into `Resident` objects.

- **File:** `test/residentRepository.test.js`
  **Purpose:** Automated persistence tests (7 required + 1 student-designed)
  that run against an isolated temporary SQLite database.

- **File:** `src/models/Resident.js`
  **Purpose:** T01 domain model. The only change was defaulting `id` to
  `null` in the constructor so a newly created Resident has no identifier
  until persistence assigns one.

- **File:** `.gitignore`
  **Purpose:** Added patterns (`data/`, `*.db`, `*.sqlite`, `*.sqlite3`) so
  the generated SQLite database file is never committed.

## SQL I Can Explain

```sql
INSERT INTO residents
  (first_name, last_name, address, contact_number, email, status)
VALUES (?, ?, ?, ?, ?, ?)
```

- **What the statement does:** It inserts one new Resident row into the
  `residents` table. It does not set `id`, because the `id` column is
  `AUTOINCREMENT`, so SQLite generates the identifier automatically.
- **What each placeholder represents:** The six `?` placeholders are bound,
  in order, to `firstName`, `lastName`, `address`, `contactNumber`,
  `email`, and `status` from the Resident being saved. Using placeholders
  (a prepared statement) means the values are supplied separately from the
  SQL text, so special characters cannot break or alter the query.
- **Which repository operation uses it:** The `save()` method in
  `ResidentRepository`.

## My Resident Mapping

A SQLite row uses snake_case column names, while the `Resident` model uses
camelCase properties. In `findById()`, the private `#mapRowToResident(row)`
helper builds a `Resident` by reading each column and passing it to the
constructor: for example, the database column `first_name` becomes the
`firstName` property, `last_name` becomes `lastName`, and `contact_number`
becomes `contactNumber`. Because `contact_number` is stored as TEXT, the
leading zero in a value like `09171234567` is preserved through storage and
retrieval.

## Problem I Encountered

- **Problem or error:** When I first ran the persistence tests on Windows,
  the test run failed while cleaning up the temporary database directory:
  `Error: EPERM, Permission denied` on the temp folder path.
- **Cause:** Each repository opened a SQLite connection but never closed it.
  On Windows the open connection kept a lock on the database file, so
  deleting the temporary directory in the cleanup hook failed.
- **How I resolved it:** I added a `close()` method to `ResidentRepository`
  and closed every repository connection in the test `afterEach` hook
  before removing the temporary files. After that, all tests passed and the
  temporary databases were cleaned up correctly.

## My Student-Designed Test

- **Test name:** "each saved resident gets a distinct, increasing identifier"
- **What it verifies:** It saves two different valid Residents and checks
  that both receive an id, that the two ids are different, and that the
  second id is greater than the first.
- **Why I chose this scenario:** The seven required tests only ever persist
  a single Resident, so none of them prove the database actually generates a
  *new* identifier for each row. This test would catch a defect where ids
  are hard-coded or where a second insert reuses/overwrites the first record
  instead of creating a new one.

## Tools and References Used

- Course T03 guide (JavaScript with Express.js).
- Node.js documentation for the built-in `node:sqlite` module
  (`DatabaseSync`, prepared statements, `run`/`get`, `lastInsertRowid`).
- Node.js documentation for `node:fs`, `node:os`, and `node:path`
  (temporary directories/files for isolated test databases).
- <!-- TODO: if you used an AI/coding assistant, state briefly what it
     helped with, e.g. "helped scaffold the repository and tests; I reviewed
     and can explain all of it." Keep it honest and in your own words. -->
```
