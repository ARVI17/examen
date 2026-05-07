import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { PerformanceLevelController } from "./performance-levels.controller";
import {
  createPerformanceLevelSchema,
  performanceLevelParamsSchema,
  updatePerformanceLevelSchema
} from "./performance-levels.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE), adminRouteRateLimiter);

router.get("/", PerformanceLevelController.list);
router.post("/", authorize(RoleCode.ADMIN), validateRequest({ body: createPerformanceLevelSchema }), PerformanceLevelController.create);
router.patch(
  "/:id",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: performanceLevelParamsSchema, body: updatePerformanceLevelSchema }),
  PerformanceLevelController.update
);

export default router;
