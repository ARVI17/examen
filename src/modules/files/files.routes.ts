import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { FilesController } from "./files.controller";
import {
  downloadByQuerySchema,
  duplicateFileBodySchema,
  fileIdParamsSchema,
  listFilesQuerySchema,
  newVersionBodySchema,
  searchFilesQuerySchema,
  updateFileBodySchema,
  uploadFileBodySchema
} from "./files.schema";
import { uploadSingleFile, validateUploadedFileIntegrity } from "./files.upload";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE), adminRouteRateLimiter);

router.post(
  "/upload",
  authorize(RoleCode.ADMIN),
  uploadSingleFile,
  validateUploadedFileIntegrity,
  validateRequest({ body: uploadFileBodySchema }),
  FilesController.upload
);
router.get("/search", validateRequest({ query: searchFilesQuerySchema }), FilesController.search);
router.get("/download", validateRequest({ query: downloadByQuerySchema }), FilesController.downloadByQuery);
router.get("/", validateRequest({ query: listFilesQuerySchema }), FilesController.list);
router.get("/:id/download", validateRequest({ params: fileIdParamsSchema }), FilesController.downloadById);
router.get("/:id", validateRequest({ params: fileIdParamsSchema }), FilesController.getById);
router.patch(
  "/:id",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: fileIdParamsSchema, body: updateFileBodySchema }),
  FilesController.update
);
router.delete("/:id", authorize(RoleCode.ADMIN), validateRequest({ params: fileIdParamsSchema }), FilesController.softDelete);
router.post(
  "/:id/new-version",
  authorize(RoleCode.ADMIN),
  uploadSingleFile,
  validateUploadedFileIntegrity,
  validateRequest({ params: fileIdParamsSchema, body: newVersionBodySchema }),
  FilesController.newVersion
);
router.post(
  "/:id/duplicate",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: fileIdParamsSchema, body: duplicateFileBodySchema }),
  FilesController.duplicate
);

export default router;
