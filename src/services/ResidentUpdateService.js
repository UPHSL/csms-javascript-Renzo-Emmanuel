import { Resident } from "../models/Resident.js";

/**
 * Application update service for Resident information (T06).
 *
 * Responsibility: coordinate the retrieval, validation, and persistence
 * of an update to an existing Resident's permitted information.
 *
 * This service does NOT reimplement validation rules (that is T02's job)
 * and does NOT write SQL directly (that is T03's job). It only coordinates.
 */
export class ResidentUpdateService {
  /**
   * @param {ResidentValidator} validator - The T02 Resident validator.
   * @param {ResidentRepository} repository - The Resident persistence layer.
   */
  constructor(validator, repository) {
    this.validator = validator;
    this.repository = repository;
  }

  /**
   * Update the permitted information of an existing persisted Resident.
   *
   * The operation:
   *   1. Looks up the existing Resident by ID.
   *   2. Returns a not-found result if no Resident exists.
   *   3. Builds a candidate Resident preserving the existing id and status.
   *   4. Validates the candidate using the T02 validator.
   *   5. Returns a validation-failure result if invalid.
   *   6. Persists the valid changes through the repository.
   *   7. Returns the updated persisted Resident.
   *
   * The result object always contains:
   *   { success, notFound, resident, errors }
   *
   * @param {number} id - The ID of the Resident to update.
   * @param {object} proposedInfo - The proposed editable field values.
   * @param {string} proposedInfo.firstName
   * @param {string} proposedInfo.lastName
   * @param {string} proposedInfo.address
   * @param {string} proposedInfo.contactNumber
   * @param {string} proposedInfo.email
   * @returns {{ success: boolean, notFound: boolean, resident: Resident|null, errors: string[] }}
   */
  updateResident(id, proposedInfo) {
    const existing = this.repository.findById(id);

    if (existing === null) {
      return { success: false, notFound: true, resident: null, errors: [] };
    }

    const candidate = new Resident({
      id: existing.id,
      firstName: proposedInfo.firstName,
      lastName: proposedInfo.lastName,
      address: proposedInfo.address,
      contactNumber: proposedInfo.contactNumber,
      email: proposedInfo.email,
      status: existing.status
    });

    const errors = this.validator.validate(candidate);

    if (errors.length > 0) {
      return { success: false, notFound: false, resident: null, errors };
    }

    const updatedResident = this.repository.update(candidate);

    return { success: true, notFound: false, resident: updatedResident, errors: [] };
  }
}
