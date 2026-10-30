/**
 * Represents a person registered within the community.
 *
 * The Resident domain model is the foundation for resident registration,
 * validation, searching, updating, service requests, and reporting.
 */
export class Resident {
  /**
   * Possible Resident status values.
   */
  static Status = {
    ACTIVE: "Active",
    INACTIVE: "Inactive",
  };

  /**
   * Create a new Resident instance.
   *
   * @param {object} residentInfo - The resident information.
   * @param {number|string|null} [residentInfo.id] - Unique identifier.
   *   Defaults to null so a newly created Resident has no identifier
   *   until the persistence layer assigns one.
   * @param {string} residentInfo.firstName - Resident's first name.
   * @param {string} residentInfo.lastName - Resident's last name.
   * @param {string} residentInfo.address - Resident's address.
   * @param {string} residentInfo.contactNumber - Resident's contact number.
   * @param {string} residentInfo.email - Resident's email address.
   * @param {string} residentInfo.status - Resident status.
   */
  constructor({ id = null, firstName, lastName, address, contactNumber, email, status }) {
    this.id = id;
    this.firstName = firstName;
    this.lastName = lastName;
    this.address = address;
    this.contactNumber = contactNumber;
    this.email = email;
    this.status = status;
  }
}