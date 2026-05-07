import { Router } from "express";
import { authenticateStudent } from "../../middlewares/auth.middleware";
import { authRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { StudentAuthController } from "./student-auth.controller";
import { studentLoginSchema } from "./student-auth.schema";

const router = Router();

router.post("/login", authRouteRateLimiter, validateRequest({ body: studentLoginSchema }), StudentAuthController.login);
router.get("/me", authenticateStudent, StudentAuthController.me);

export default router;
