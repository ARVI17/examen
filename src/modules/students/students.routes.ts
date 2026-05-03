import { Router } from "express";
import multer from "multer";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { StudentController } from "./students.controller";
import {
  createStudentSchema,
  listStudentsQuerySchema,
  studentDocumentParamsSchema,
  studentParamsSchema,
  updateStudentSchema
} from "./students.schema";

const router = Router();
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024
  }
});

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE), adminRouteRateLimiter);

router.get("/bulk/template.csv", StudentController.bulkTemplate);
router.post("/bulk", bulkUpload.single("file"), StudentController.bulkCreate);
router.post("/", validateRequest({ body: createStudentSchema }), StudentController.create);
router.get("/", validateRequest({ query: listStudentsQuerySchema }), StudentController.list);
router.get(
  "/document/:numero_identificacion/history",
  validateRequest({ params: studentDocumentParamsSchema }),
  StudentController.historyByDocument
);
router.get(
  "/document/:numero_identificacion",
  validateRequest({ params: studentDocumentParamsSchema }),
  StudentController.getByDocument
);
router.get("/:id/history", validateRequest({ params: studentParamsSchema }), StudentController.historyById);
router.get("/:id", validateRequest({ params: studentParamsSchema }), StudentController.getById);
router.patch(
  "/:id",
  validateRequest({ params: studentParamsSchema, body: updateStudentSchema }),
  StudentController.update
);
router.delete("/:id", validateRequest({ params: studentParamsSchema }), StudentController.softDelete);

export default router;
