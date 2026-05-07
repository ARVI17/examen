import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { ExamController } from "./exams.controller";
import {
  addExamQuestionsSchema,
  createExamAssignmentSchema,
  createExamSchema,
  examParamsSchema,
  listExamsQuerySchema,
  listPublicExamsQuerySchema,
  updateExamSchema
} from "./exams.schema";

const router = Router();

router.get("/public", validateRequest({ query: listPublicExamsQuerySchema }), ExamController.listPublic);

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE), adminRouteRateLimiter);

router.get("/", validateRequest({ query: listExamsQuerySchema }), ExamController.list);
router.get("/:id", validateRequest({ params: examParamsSchema }), ExamController.getById);
router.get("/:id/questions", validateRequest({ params: examParamsSchema }), ExamController.listQuestions);
router.get("/:id/assignments", validateRequest({ params: examParamsSchema }), ExamController.listAssignments);

router.post("/", authorize(RoleCode.ADMIN), validateRequest({ body: createExamSchema }), ExamController.create);
router.patch("/:id", authorize(RoleCode.ADMIN), validateRequest({ params: examParamsSchema, body: updateExamSchema }), ExamController.update);
router.delete("/:id", authorize(RoleCode.ADMIN), validateRequest({ params: examParamsSchema }), ExamController.softDelete);
router.post(
  "/:id/questions",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: examParamsSchema, body: addExamQuestionsSchema }),
  ExamController.addQuestions
);
router.post(
  "/:id/assignments",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: examParamsSchema, body: createExamAssignmentSchema }),
  ExamController.createAssignment
);

export default router;
