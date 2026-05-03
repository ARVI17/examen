import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { QuestionController } from "./questions.controller";
import {
  createQuestionSchema,
  listGeneratedQuestionsQuerySchema,
  listQuestionsQuerySchema,
  questionParamsSchema,
  updateGeneratedQuestionStatusSchema,
  updateQuestionSchema
} from "./questions.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE), adminRouteRateLimiter);

router.post("/", validateRequest({ body: createQuestionSchema }), QuestionController.create);
router.get("/", validateRequest({ query: listQuestionsQuerySchema }), QuestionController.list);
router.get("/generated", validateRequest({ query: listGeneratedQuestionsQuerySchema }), QuestionController.listGenerated);
router.get("/:id", validateRequest({ params: questionParamsSchema }), QuestionController.getById);
router.patch(
  "/:id/ai-status",
  validateRequest({ params: questionParamsSchema, body: updateGeneratedQuestionStatusSchema }),
  QuestionController.updateGeneratedStatus
);
router.patch(
  "/:id",
  validateRequest({ params: questionParamsSchema, body: updateQuestionSchema }),
  QuestionController.update
);
router.delete("/:id", validateRequest({ params: questionParamsSchema }), QuestionController.softDelete);

export default router;
