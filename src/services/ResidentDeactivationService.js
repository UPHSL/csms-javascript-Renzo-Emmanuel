/**
 * Application deactivation service for Resident lifecycle (T07).
 *
 * Responsibility: coordinate the soft deactivation of an existing Resident.
 * Changes an Active Resident to Inactive while preserving all other
 * information and keeping the record in persistence.
 *
 * This service does NOT revalidate personal information (T07 is not an
 * information update) and does NOT write SQL directly (that is T03's job).
 */
export class ResidentDeactivationService {
  /**
   * @param {ResidentRepository} repository - The Resident persistence layer.
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Deactivate an existing Resident.
   *
   * The operation:
   *   1. Looks up the existing Resident by ID.
   *   2. Returns a not-found result if no Resident exists.
   *   3. Returns an already-inactive result if the Resident is already Inactive.
   *   4. Persists the status change to Inactive through the repository.
   *   5. Returns the updated persisted Resident.
   *
   * The result object always contains:
   *   { success, notFound, alreadyInactive, resident }
   *
   * @param {number} id - The ID of the Resident to deactivate.
   * @returns {{ success: boolean, notFound: boolean, alreadyInactive: boolean, resident: Resident|null }}
   */
  deactivateResident(id) {
    const existing = this.repository.findById(id);

    if (existing === null) {
      return { success: false, notFound: true, alreadyInactive: false, resident: null };
    }

    if (existing.status === "Inactive") {
      return { success: true, notFound: false, alreadyInactive: true, resident: existing };
    }

    const deactivated = this.repository.deactivateById(id);

    return { success: true, notFound: false, alreadyInactive: false, resident: deactivated };
  }
}
