import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { QuestionController } from "./questions.controller";
import {
  createQuestionSchema,
  listQuestionsQuerySchema,
  questionParamsSchema,
  updateQuestionSchema
} from "./questions.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE));

router.post("/", validateRequest({ body: createQuestionSchema }), QuestionController.create);
router.get("/", validateRequest({ query: listQuestionsQuerySchema }), QuestionController.list);
router.get("/:id", validateRequest({ params: questionParamsSchema }), QuestionController.getById);
router.patch(
  "/:id",
  validateRequest({ params: questionParamsSchema, body: updateQuestionSchema }),
  QuestionController.update
);
router.delete("/:id", validateRequest({ params: questionParamsSchema }), QuestionController.softDelete);

export default router;
