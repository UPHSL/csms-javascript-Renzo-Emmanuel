import { Router } from "express";

import { showHealth } from "../controllers/healthController.js";
import { showHome } from "../controllers/homeController.js";
import {
  listResidents,
  showRegistrationForm,
  registerResident,
  showEditForm,
  updateResident,
  deactivateResident
} from "../controllers/residentController.js";
import {
  listServiceRequests,
  showSubmissionForm,
  submitServiceRequest,
  viewServiceRequest,
  startProcessing,
  completeRequest,
  cancelRequest
} from "../controllers/serviceRequestController.js";

const router = Router();

router.get("/", showHome);
router.get("/health", showHealth);

// Resident Management routes (T12).
// NOTE: /residents/new must be declared before /residents/:id to prevent
// Express from treating the literal string "new" as an ID parameter.
router.get("/residents", listResidents);
router.get("/residents/new", showRegistrationForm);
router.post("/residents", registerResident);
router.get("/residents/:id/edit", showEditForm);
router.post("/residents/:id/edit", updateResident);
router.post("/residents/:id/deactivate", deactivateResident);

// Service Request Management routes (T13).
// NOTE: /service-requests/new must be declared before /service-requests/:id
// to prevent Express from treating the literal string "new" as an ID parameter.
router.get("/service-requests", listServiceRequests);
router.get("/service-requests/new", showSubmissionForm);
router.post("/service-requests", submitServiceRequest);
router.get("/service-requests/:id", viewServiceRequest);
router.post("/service-requests/:id/process", startProcessing);
router.post("/service-requests/:id/complete", completeRequest);
router.post("/service-requests/:id/cancel", cancelRequest);

export default router;