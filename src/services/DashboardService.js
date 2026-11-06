/**
 * Application query service for the CSMS Dashboard (T14).
 *
 * Responsibility: compose a complete dashboard summary by requesting
 * aggregate counts and recent records from the Resident and Service Request
 * repositories. This service does NOT perform any transactional business
 * operations — it is strictly read-only.
 *
 * What this service does:
 *   - Request Resident total and per-status counts from ResidentRepository.
 *   - Request ServiceRequest total and per-status counts from
 *     ServiceRequestRepository.
 *   - Derive the Open Service Request count (Pending + In Progress) without
 *     introducing a new stored status value.
 *   - Request the five most recent Service Requests from
 *     ServiceRequestRepository using the T11-established ordering.
 *   - Return all of the above as a single plain summary object.
 *
 * What this service does NOT do:
 *   - Validate Residents or Service Requests.
 *   - Register, update, or deactivate Residents.
 *   - Submit or change the status of Service Requests.
 *   - Render HTML or interact with HTTP.
 *   - Manage database connections directly.
 *   - Call findAll() and loop in memory to produce counts — all counting
 *     is delegated to the persistence layer via aggregate query methods.
 *
 * getDashboardSummary() return shape:
 * {
 *   residents: {
 *     total:    number,
 *     active:   number,
 *     inactive: number
 *   },
 *   serviceRequests: {
 *     total:      number,
 *     pending:    number,
 *     inProgress: number,
 *     completed:  number,
 *     cancelled:  number,
 *     open:       number   ← derived: pending + inProgress
 *   },
 *   recentServiceRequests: ServiceRequest[]  ← at most 5, T11 ordering
 * }
 */

import { Resident } from "../models/Resident.js";
import { ServiceRequest } from "../models/ServiceRequest.js";

export class DashboardService {
  /**
   * @param {import("../repositories/ResidentRepository.js").ResidentRepository} residentRepository
   * @param {import("../repositories/ServiceRequestRepository.js").ServiceRequestRepository} serviceRequestRepository
   */
  constructor(residentRepository, serviceRequestRepository) {
    this.residentRepository = residentRepository;
    this.serviceRequestRepository = serviceRequestRepository;
  }

  /**
   * Compose and return a complete dashboard summary.
   *
   * All counts come from persistence-level aggregate queries. The Open
   * Service Request count is derived here rather than stored, to avoid
   * introducing a new status value.
   *
   * @returns {{
   *   residents: { total: number, active: number, inactive: number },
   *   serviceRequests: {
   *     total: number,
   *     pending: number,
   *     inProgress: number,
   *     completed: number,
   *     cancelled: number,
   *     open: number
   *   },
   *   recentServiceRequests: import("../models/ServiceRequest.js").ServiceRequest[]
   * }}
   */
  getDashboardSummary() {
    // --- Resident aggregate counts ---
    const residentTotal    = this.residentRepository.countAll();
    const residentActive   = this.residentRepository.countByStatus(Resident.Status.ACTIVE);
    const residentInactive = this.residentRepository.countByStatus(Resident.Status.INACTIVE);

    // --- Service Request aggregate counts ---
    const srTotal     = this.serviceRequestRepository.countAll();
    const srPending   = this.serviceRequestRepository.countByStatus(ServiceRequest.Status.PENDING);
    const srInProgress = this.serviceRequestRepository.countByStatus(ServiceRequest.Status.IN_PROGRESS);
    const srCompleted = this.serviceRequestRepository.countByStatus(ServiceRequest.Status.COMPLETED);
    const srCancelled = this.serviceRequestRepository.countByStatus(ServiceRequest.Status.CANCELLED);

    // --- Derived metric: Open = Pending + In Progress ---
    // Open is NOT a stored status. It is calculated from the existing
    // authoritative status values. Completed and Cancelled are terminal
    // and therefore not considered open.
    const srOpen = srPending + srInProgress;

    // --- Recent Service Requests (max 5, T11 ordering) ---
    const recentServiceRequests = this.serviceRequestRepository.findRecent(5);

    return {
      residents: {
        total:    residentTotal,
        active:   residentActive,
        inactive: residentInactive
      },
      serviceRequests: {
        total:      srTotal,
        pending:    srPending,
        inProgress: srInProgress,
        completed:  srCompleted,
        cancelled:  srCancelled,
        open:       srOpen
      },
      recentServiceRequests
    };
  }
}
