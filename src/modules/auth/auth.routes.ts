import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { authRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { AuthController } from "./auth.controller";
import { loginSchema, registerSchema } from "./auth.schema";

const router = Router();

router.post(
  "/register",
  authenticate,
  authorize(RoleCode.ADMIN),
  authRouteRateLimiter,
  validateRequest({ body: registerSchema }),
  AuthController.register
);
router.post("/login", authRouteRateLimiter, validateRequest({ body: loginSchema }), AuthController.login);
router.get("/me", authenticate, AuthController.me);

export default router;
