import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { AdminSystemController } from "./admin-system.controller";
import {
  systemBackupSchema,
  systemChecklistParamsSchema,
  systemChecklistUpdateSchema,
  systemImportApplySchema,
  systemImportDryRunSchema,
  systemLocalPrepareSchema
} from "./admin-system.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN), adminRouteRateLimiter);

router.get("/status", AdminSystemController.status);
router.get("/lan", AdminSystemController.lan);
router.get("/health", AdminSystemController.health);
router.get("/operations", AdminSystemController.operations);
router.get("/checklist", AdminSystemController.checklist);
router.post("/checklist/:itemId", validateRequest({ params: systemChecklistParamsSchema, body: systemChecklistUpdateSchema }), AdminSystemController.updateChecklist);
router.post("/schools/import/dry-run", validateRequest({ body: systemImportDryRunSchema }), AdminSystemController.schoolsImportDryRun);
router.post("/schools/import/apply", validateRequest({ body: systemImportApplySchema }), AdminSystemController.schoolsImportApply);
router.post("/backup", validateRequest({ body: systemBackupSchema }), AdminSystemController.backup);
router.post("/local-production/prepare", validateRequest({ body: systemLocalPrepareSchema }), AdminSystemController.localProductionPrepare);

export default router;
