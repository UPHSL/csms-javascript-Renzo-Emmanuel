/**
 * Presentation layer controller for the CSMS Dashboard (T14).
 *
 * Responsibility: receive the GET /dashboard request, call DashboardService
 * to obtain the aggregate summary, and render the result through the
 * dashboard EJS view.
 *
 * This controller does NOT contain business logic, validation rules, or SQL.
 * All aggregate querying is delegated to DashboardService, which in turn
 * delegates to the repositories.
 *
 * The dashboard is strictly read-only. Rendering it never creates, updates,
 * or deletes any Resident or Service Request record.
 */

import { ResidentRepository } from "../repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../repositories/ServiceRequestRepository.js";
import { DashboardService } from "../services/DashboardService.js";

/**
 * GET /dashboard
 *
 * Render the CSMS operational dashboard. Retrieves aggregate Resident and
 * Service Request metrics plus the five most recent Service Requests from
 * DashboardService, then passes them to the dashboard/index view.
 *
 * Both repositories are closed in the finally block regardless of whether
 * the render succeeds or throws, consistent with the pattern used in
 * residentController and serviceRequestController.
 *
 * @param {import("express").Request} request
 * @param {import("express").Response} response
 */
export function showDashboard(request, response) {
  const databasePath = request.app.locals.databasePath;
  const residentRepository = new ResidentRepository(databasePath);
  const serviceRequestRepository = new ServiceRequestRepository(databasePath);

  try {
    const dashboardService = new DashboardService(
      residentRepository,
      serviceRequestRepository
    );

    const summary = dashboardService.getDashboardSummary();

    response.status(200).render("dashboard/index", {
      residents:              summary.residents,
      serviceRequests:        summary.serviceRequests,
      recentServiceRequests:  summary.recentServiceRequests
    });
  } finally {
    residentRepository.close();
    serviceRequestRepository.close();
  }
}
