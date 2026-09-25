# T08 - Define Service Request Domain Model

## What Is This About?

From T01 through T07, the entire system was focused on one thing: Residents. The system can now create, validate, save, register, search, list, update, and deactivate a Resident. That foundation is complete.

T08 starts something new. The whole point of a community services management system is not just to track who lives in the community — it is to handle the requests those residents make for community services. Things like barangay clearances, certificates, permits, and assistance.

Before the system can do any of that, it needs to know what a Service Request looks like. This task is about answering one simple question: **what information does a Service Request contain?**

Think of it like designing a new type of form. Before you can fill one out, submit one, file one, or search for one — you first need to decide what fields are on the form. That is all T08 does.

Still no web pages, no submission buttons, no validation rules, no database table — just the definition of what a Service Request is.

## Summary

This ticket replaces the existing empty `ServiceRequest` placeholder with a complete domain model. It defines the six fields a Service Request must contain, establishes that every new Service Request automatically starts with a status of `Pending`, and ensures the ID begins unassigned until a future persistence layer assigns one. It follows the exact same structural pattern as the existing `Resident` model for consistency.

## The Eight Responsibilities (kept separate)

| Ticket | File                                                  | Job                                                      |
|--------|-------------------------------------------------------|----------------------------------------------------------|
| T01    | `src/models/Resident.js`                              | Represents what a resident *is*                          |
| T02    | `src/services/ResidentValidator.js`                   | Decides if resident info is *valid*                      |
| T03    | `src/repositories/ResidentRepository.js`              | *Stores, retrieves, queries, updates, and deactivates* residents |
| T04    | `src/services/ResidentRegistrationService.js`         | *Coordinates* validation and persistence for registration |
| T05    | `src/services/ResidentService.js`                     | *Coordinates* listing and search operations              |
| T06    | `src/services/ResidentUpdateService.js`               | *Coordinates* lookup, validation, and information update |
| T07    | `src/services/ResidentDeactivationService.js`         | *Coordinates* lookup and soft deactivation               |
| T08    | `src/models/ServiceRequest.js`                        | Represents what a service request *is*                   |

T08 is a domain model only. It does not validate, persist, submit, or manage anything.

## Implementation Details

### The Service Request Model

```
src/models/ServiceRequest.js
```

The existing empty placeholder was replaced with the full domain model. It follows the same constructor pattern as `Resident.js` — a destructured object parameter with sensible defaults:

```javascript
static Status = {
  PENDING: "Pending"
};

constructor({ id = null, residentId, serviceType, description, dateRequested, status = "Pending" })
```

### The Six Fields

| Field           | Purpose                                              | Default  |
|-----------------|------------------------------------------------------|----------|
| `id`            | Unique identifier assigned by persistence            | `null`   |
| `residentId`    | ID of the Resident who owns this request             | supplied |
| `serviceType`   | Category of community service being requested        | supplied |
| `description`   | Details about the request                            | supplied |
| `dateRequested` | Date associated with the request                     | supplied |
| `status`        | Current lifecycle status                             | `"Pending"` |

### The Resident Association

A Service Request belongs to a Resident. This relationship is represented by storing the Resident's ID:

```javascript
residentId = 25   // means this request belongs to Resident with id = 25
```

The Service Request does **not** copy the Resident's personal information:

```javascript
// These fields do NOT exist on ServiceRequest — they belong to Resident
residentFirstName   ✗
residentLastName    ✗
residentAddress     ✗
residentContactNumber ✗
residentEmail       ✗
```

The Resident domain remains responsible for Resident information. T08 only stores the reference.

### The Default Pending Status

Every new Service Request automatically begins as `Pending`. The caller does not have to set it:

```javascript
const request = new ServiceRequest({
  residentId: 25,
  serviceType: "Barangay Clearance",
  description: "For employment requirement",
  dateRequested: "2026-09-25"
  // status not supplied — automatically "Pending"
});

request.status  // "Pending"
```

The `Status.PENDING` static constant mirrors the pattern established by `Resident.Status`:

```javascript
ServiceRequest.Status.PENDING  // "Pending"
```

### The Unassigned ID

A newly created Service Request has no ID yet:

```javascript
const request = new ServiceRequest({ ... });
request.id  // null
```

The ID will be assigned by the persistence layer in a future ticket. T08 does not generate IDs.

### What the Model Does NOT Do

- Does not validate any field (that belongs to T09)
- Does not check whether the Resident exists (that belongs to T09)
- Does not connect to a database (that belongs to T09)
- Does not submit or process the request (that belongs to T09)
- Does not implement status transitions like Pending → In Progress (future ticket)
- Does not generate IDs (persistence will handle that)
- Does not duplicate Resident personal information

## Automated Tests

### Location

```
test/serviceRequest.test.js
```

### No Database Required

All T08 tests are pure domain model tests. No SQLite file, no repository, no temporary directory setup needed. A `ServiceRequest` object can be constructed and tested entirely in memory.

### Test Coverage (6 required)

| # | Test                                              | What It Verifies                                                              |
|---|---------------------------------------------------|-------------------------------------------------------------------------------|
| 1 | Service Request can be created                    | Object is successfully constructed with valid information                     |
| 2 | Service Request information is accessible         | All supplied fields retrievable from the object                               |
| 3 | Resident ID is preserved                          | `residentId = 25` stays `25`, not replaced or modified                        |
| 4 | New Service Request has an unassigned ID          | `id === null` before any persistence exists                                   |
| 5 | New Service Request defaults to Pending           | `status === "Pending"` without the caller setting it, matches `Status.PENDING`|
| 6 | Service Request objects are independent           | Two objects with different data do not share or overwrite each other's fields |

### Running Tests

```bash
npm test                                        # full suite
node --test test/serviceRequest.test.js         # just the T08 tests
```

## Verification Results

| Check                                    | Result |
|------------------------------------------|--------|
| Full test suite (68 tests)               | Pass   |
| T08 tests (6 tests)                      | Pass   |
| T01 through T07, starter                 | Pass   |
| Application starts                       | Pass   |
| GET /health                              | 200 OK |
| GET /                                    | 200 OK |

## Out of Scope

- Service Request validation
- Resident existence verification
- Service Request persistence or database table
- Service Request repository
- Service Request submission
- Service Request generated IDs
- Service Request search or listing
- Service Request status transitions
- Service Request controllers, routes, REST API, or UI
- Dashboard, authentication, authorization

## Git Workflow

- **Branch:** `feature/t08-service-request-domain-model`
- **Commit message:** `feat: define service request domain model`
- **Pull Request:** `T08 - Define Service Request Domain Model` (into `main`)

## Quick Mental Model

- **T01** = the Resident form (what a resident looks like)
- **T02** = the rules checker (is this resident valid?)
- **T03** = the Resident filing cabinet (save, find, search, update, deactivate)
- **T04** = the registration staff (takes the form, checks the rules, files it)
- **T05** = the records staff (finds folders by name or lists them all)
- **T06** = the correction staff (updates an existing folder's information)
- **T07** = the status staff (moves a folder to the inactive section)
- **T08** = the Service Request form design (what a service request looks like — the form exists, but nothing is filled out, submitted, or filed yet)
