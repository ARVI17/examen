import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { PerformanceLevelController } from "./performance-levels.controller";
import {
  createPerformanceLevelSchema,
  performanceLevelParamsSchema,
  updatePerformanceLevelSchema
} from "./performance-levels.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE));

router.post("/", validateRequest({ body: createPerformanceLevelSchema }), PerformanceLevelController.create);
router.get("/", PerformanceLevelController.list);
router.patch(
  "/:id",
  validateRequest({ params: performanceLevelParamsSchema, body: updatePerformanceLevelSchema }),
  PerformanceLevelController.update
);

export default router;
