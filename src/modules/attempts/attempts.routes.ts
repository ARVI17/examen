import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter, publicSimulatorRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { AttemptController } from "./attempts.controller";
import {
  answerAttemptSchema,
  attemptExamParamsSchema,
  attemptParamsSchema,
  attemptStudentParamsSchema,
  pendingSessionTwoQuerySchema,
  startAttemptSchema,
  stopAttemptSchema
} from "./attempts.schema";

const router = Router();

router.use("/public", publicSimulatorRateLimiter);
router.post("/public/start", validateRequest({ body: startAttemptSchema }), AttemptController.publicStart);
router.get("/public/:id", validateRequest({ params: attemptParamsSchema }), AttemptController.publicGetById);
router.post(
  "/public/:id/answer",
  validateRequest({ params: attemptParamsSchema, body: answerAttemptSchema }),
  AttemptController.answer
);
router.post("/public/:id/submit", validateRequest({ params: attemptParamsSchema }), AttemptController.publicSubmit);
router.post(
  "/public/:id/stop",
  validateRequest({ params: attemptParamsSchema, body: stopAttemptSchema }),
  AttemptController.publicStop
);
router.post(
  "/public/:id/restart",
  validateRequest({ params: attemptParamsSchema, body: stopAttemptSchema }),
  AttemptController.publicRestart
);
router.post(
  "/public/:id/session1/complete",
  validateRequest({ params: attemptParamsSchema }),
  AttemptController.completeSessionOne
);

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE), adminRouteRateLimiter);

router.post("/start", validateRequest({ body: startAttemptSchema }), AttemptController.start);
router.post("/:id/answer", validateRequest({ params: attemptParamsSchema, body: answerAttemptSchema }), AttemptController.answer);
router.post("/:id/submit", validateRequest({ params: attemptParamsSchema }), AttemptController.submit);
router.post(
  "/:id/stop",
  validateRequest({ params: attemptParamsSchema, body: stopAttemptSchema }),
  AttemptController.stop
);
router.post(
  "/:id/restart",
  validateRequest({ params: attemptParamsSchema, body: stopAttemptSchema }),
  AttemptController.restart
);
router.post("/:id/session2/enable", validateRequest({ params: attemptParamsSchema }), AttemptController.enableSessionTwo);
router.get(
  "/pending-session2",
  validateRequest({ query: pendingSessionTwoQuerySchema }),
  AttemptController.pendingSessionTwo
);
router.get(
  "/student/:numero_identificacion",
  validateRequest({ params: attemptStudentParamsSchema }),
  AttemptController.getByStudentDocument
);
router.get("/exam/:examId", validateRequest({ params: attemptExamParamsSchema }), AttemptController.getByExam);
router.get("/:id", validateRequest({ params: attemptParamsSchema }), AttemptController.getById);

export default router;
