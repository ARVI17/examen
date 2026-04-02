import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { ReportController } from "./reports.controller";
import {
  examReportParamsSchema,
  filesCoverageQuerySchema,
  reportsFilterQuerySchema,
  studentReportParamsSchema
} from "./reports.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE));

router.get(
  "/student/:numero_identificacion/summary",
  validateRequest({ params: studentReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.studentSummary
);
router.get(
  "/student/:numero_identificacion/areas",
  validateRequest({ params: studentReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.studentAreas
);
router.get(
  "/exam/:examId/summary",
  validateRequest({ params: examReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.examSummary
);
router.get(
  "/exam/:examId/ranking",
  validateRequest({ params: examReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.examRanking
);
router.get("/dashboard/overview", validateRequest({ query: reportsFilterQuerySchema }), ReportController.dashboardOverview);
router.get(
  "/files/coverage/export.csv",
  validateRequest({ query: filesCoverageQuerySchema }),
  ReportController.filesCoverageExportCsv
);
router.get("/files/coverage", validateRequest({ query: filesCoverageQuerySchema }), ReportController.filesCoverage);

export default router;
