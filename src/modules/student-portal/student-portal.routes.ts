import { Router } from "express";
import { authenticateStudent } from "../../middlewares/auth.middleware";
import { publicSimulatorRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { StudentPortalController } from "./student-portal.controller";
import { studentAnswerSchema, studentAttemptParamsSchema, studentStartAttemptSchema } from "./student-portal.schema";

const router = Router();

router.use(authenticateStudent, publicSimulatorRateLimiter);

router.get("/home", StudentPortalController.home);
router.get("/exams", StudentPortalController.listExams);
router.post("/attempts/start", validateRequest({ body: studentStartAttemptSchema }), StudentPortalController.startAttempt);
router.get("/attempts/:id", validateRequest({ params: studentAttemptParamsSchema }), StudentPortalController.getAttempt);
router.post(
  "/attempts/:id/answer",
  validateRequest({ params: studentAttemptParamsSchema, body: studentAnswerSchema }),
  StudentPortalController.answerAttempt
);
router.post(
  "/attempts/:id/submit",
  validateRequest({ params: studentAttemptParamsSchema }),
  StudentPortalController.submitAttempt
);
router.post(
  "/attempts/:id/session1/complete",
  validateRequest({ params: studentAttemptParamsSchema }),
  StudentPortalController.completeSessionOne
);
router.get("/results", StudentPortalController.listResults);
router.get("/results/:id", validateRequest({ params: studentAttemptParamsSchema }), StudentPortalController.getResult);

export default router;
