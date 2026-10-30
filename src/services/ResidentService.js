/**
 * Application query service for Resident listing and search (T05).
 *
 * Responsibility: coordinate Resident retrieval operations.
 * Decides whether to list all Residents or perform a name search,
 * then delegates the actual data access to the repository.
 */
export class ResidentService {
  /**
   * @param {ResidentRepository} repository - The Resident persistence layer.
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Return all persisted Residents in deterministic order.
   *
   * @returns {Resident[]} All Residents ordered by last name, first name, id.
   */
  listResidents() {
    return this.repository.findAll();
  }

  /**
   * Search Residents by name, or list all when the term is blank.
   *
   * Leading and trailing whitespace is trimmed before evaluation.
   * A blank term returns the same result as listResidents().
   * A non-blank term performs a case-insensitive partial-name search
   * through the persistence layer.
   *
   * @param {string} term - The search input from the caller.
   * @returns {Resident[]} Matching Residents, or all Residents if term is blank.
   */
  searchResidents(term) {
    const trimmed = term.trim();

    if (trimmed === "") {
      return this.listResidents();
    }

    return this.repository.findByName(trimmed);
  }
}