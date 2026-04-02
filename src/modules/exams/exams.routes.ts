import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { ExamController } from "./exams.controller";
import {
  addExamQuestionsSchema,
  createExamSchema,
  examParamsSchema,
  listExamsQuerySchema,
  updateExamSchema
} from "./exams.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE));

router.post("/", validateRequest({ body: createExamSchema }), ExamController.create);
router.get("/", validateRequest({ query: listExamsQuerySchema }), ExamController.list);
router.get("/:id", validateRequest({ params: examParamsSchema }), ExamController.getById);
router.patch("/:id", validateRequest({ params: examParamsSchema, body: updateExamSchema }), ExamController.update);
router.delete("/:id", validateRequest({ params: examParamsSchema }), ExamController.softDelete);
router.post(
  "/:id/questions",
  validateRequest({ params: examParamsSchema, body: addExamQuestionsSchema }),
  ExamController.addQuestions
);
router.get("/:id/questions", validateRequest({ params: examParamsSchema }), ExamController.listQuestions);

export default router;
