import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { AttemptController } from "./attempts.controller";
import {
  answerAttemptSchema,
  attemptExamParamsSchema,
  attemptParamsSchema,
  attemptStudentParamsSchema,
  startAttemptSchema
} from "./attempts.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE));

router.post("/start", validateRequest({ body: startAttemptSchema }), AttemptController.start);
router.post("/:id/answer", validateRequest({ params: attemptParamsSchema, body: answerAttemptSchema }), AttemptController.answer);
router.post("/:id/submit", validateRequest({ params: attemptParamsSchema }), AttemptController.submit);
router.get(
  "/student/:numero_identificacion",
  validateRequest({ params: attemptStudentParamsSchema }),
  AttemptController.getByStudentDocument
);
router.get("/exam/:examId", validateRequest({ params: attemptExamParamsSchema }), AttemptController.getByExam);
router.get("/:id", validateRequest({ params: attemptParamsSchema }), AttemptController.getById);

export default router;
