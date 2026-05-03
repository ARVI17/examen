import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { ReportController } from "./reports.controller";
import {
  classroomSummaryQuerySchema,
  examReportParamsSchema,
  filesCoverageQuerySchema,
  groupReportParamsSchema,
  questionReadinessQuerySchema,
  reportsFilterQuerySchema,
  schoolReportParamsSchema,
  studentReportParamsSchema
} from "./reports.schema";

const router = Router();

router.use(authenticate, authorize(RoleCode.ADMIN, RoleCode.DOCENTE), adminRouteRateLimiter);

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
  "/student/:numero_identificacion/performance",
  validateRequest({ params: studentReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.studentPerformance
);
router.get(
  "/student/:numero_identificacion/performance/export.csv",
  validateRequest({ params: studentReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.studentPerformanceExportCsv
);
router.get(
  "/student/:numero_identificacion/performance/export.pdf",
  validateRequest({ params: studentReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.studentPerformanceExportPdf
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
  "/classroom/summary",
  validateRequest({ query: classroomSummaryQuerySchema }),
  ReportController.classroomSummary
);
router.get(
  "/classroom/summary/export.csv",
  validateRequest({ query: classroomSummaryQuerySchema }),
  ReportController.classroomSummaryExportCsv
);
router.get(
  "/classroom/summary/export.pdf",
  validateRequest({ query: classroomSummaryQuerySchema }),
  ReportController.classroomSummaryExportPdf
);
router.get(
  "/group/:groupId/summary",
  validateRequest({ params: groupReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.groupSummary
);
router.get(
  "/school/:schoolId/summary",
  validateRequest({ params: schoolReportParamsSchema, query: reportsFilterQuerySchema }),
  ReportController.schoolSummary
);
router.get(
  "/questions/readiness",
  validateRequest({ query: questionReadinessQuerySchema }),
  ReportController.questionsReadiness
);
router.get("/files/material-local/coverage", ReportController.materialLocalCoverage);
router.get(
  "/files/coverage/export.csv",
  validateRequest({ query: filesCoverageQuerySchema }),
  ReportController.filesCoverageExportCsv
);
router.get("/files/coverage", validateRequest({ query: filesCoverageQuerySchema }), ReportController.filesCoverage);

export default router;
