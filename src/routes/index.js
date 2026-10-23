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

export default router;