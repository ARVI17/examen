import { Router } from "express";
import multer from "multer";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { UsersController } from "./users.controller";
import { createUserSchema, listUsersQuerySchema, updateUserSchema, userParamsSchema } from "./users.schema";

const router = Router();
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

router.use(authenticate, authorize(RoleCode.ADMIN), adminRouteRateLimiter);

router.get("/bulk/template.csv", UsersController.bulkTemplate);
router.post("/bulk", bulkUpload.single("file"), UsersController.bulkCreate);
router.get("/", validateRequest({ query: listUsersQuerySchema }), UsersController.list);
router.post("/", validateRequest({ body: createUserSchema }), UsersController.create);
router.patch("/:id", validateRequest({ params: userParamsSchema, body: updateUserSchema }), UsersController.update);

export default router;
