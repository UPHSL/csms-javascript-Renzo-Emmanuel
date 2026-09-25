/**
 * Coordinates the full service-request submission flow (T09).
 *
 * This service is the single entry point for submitting a new
 * ServiceRequest. It orchestrates three collaborators in order:
 *
 *   1. ServiceRequestValidator  — checks intrinsic fields (no DB access)
 *   2. ResidentRepository       — confirms the referenced Resident exists
 *   3. ServiceRequestRepository — persists the validated, eligible request
 *
 * Every outcome is expressed as a plain result object with five fields:
 *
 *   success          {boolean} — true only when the request was persisted
 *   residentNotFound {boolean} — true when the Resident id has no match
 *   residentInactive {boolean} — true when the Resident exists but is Inactive
 *   serviceRequest   {ServiceRequest|null} — the persisted request, or null
 *   errors           {string[]} — failing field names from validation, or []
 *
 * The four possible outcomes are mutually exclusive:
 *
 *   Outcome A — validation failure  : success=false, errors non-empty
 *   Outcome B — Resident not found  : success=false, residentNotFound=true
 *   Outcome C — Resident inactive   : success=false, residentInactive=true
 *   Outcome D — submitted           : success=true,  serviceRequest set
 */
export class ServiceRequestSubmissionService {
  /**
   * @param {ServiceRequestValidator}  validator                 - Intrinsic field validator.
   * @param {ServiceRequestRepository} serviceRequestRepository  - Persistence for requests.
   * @param {ResidentRepository}       residentRepository        - Persistence for residents.
   */
  constructor(validator, serviceRequestRepository, residentRepository) {
    this.validator = validator;
    this.serviceRequestRepository = serviceRequestRepository;
    this.residentRepository = residentRepository;
  }

  /**
   * Attempt to submit a ServiceRequest.
   *
   * @param {ServiceRequest} serviceRequest - The request to submit.
   * @returns {{ success: boolean, residentNotFound: boolean, residentInactive: boolean, serviceRequest: ServiceRequest|null, errors: string[] }}
   */
  submitServiceRequest(serviceRequest) {
    // --- Step 1: intrinsic validation ---
    const errors = this.validator.validate(serviceRequest);

    if (errors.length > 0) {
      return {
        success: false,
        residentNotFound: false,
        residentInactive: false,
        serviceRequest: null,
        errors
      };
    }

    // --- Step 2: confirm Resident exists ---
    const resident = this.residentRepository.findById(serviceRequest.residentId);

    if (resident === null) {
      return {
        success: false,
        residentNotFound: true,
        residentInactive: false,
        serviceRequest: null,
        errors: []
      };
    }

    // --- Step 3: confirm Resident is Active ---
    if (resident.status === "Inactive") {
      return {
        success: false,
        residentNotFound: false,
        residentInactive: true,
        serviceRequest: null,
        errors: []
      };
    }

    // --- Step 4: persist the request ---
    const persistedRequest = this.serviceRequestRepository.save(serviceRequest);

    return {
      success: true,
      residentNotFound: false,
      residentInactive: false,
      serviceRequest: persistedRequest,
      errors: []
    };
  }
}
