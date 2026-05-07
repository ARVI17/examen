import { Request, Response } from "express";
import { sendSuccess } from "../../common/utils/api-response";
import { ReportService } from "./reports.service";

export class ReportController {
  static async studentSummary(req: Request, res: Response) {
    const data = await ReportService.studentSummary(
      req.params.numero_identificacion,
      req.query as Record<string, unknown>,
      req.user
    );
    return sendSuccess(res, "Resumen de estudiante", data);
  }

  static async studentAreas(req: Request, res: Response) {
    const data = await ReportService.studentAreas(req.params.numero_identificacion, req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Resultados por areas", data);
  }

  static async studentPerformance(req: Request, res: Response) {
    const data = await ReportService.studentPerformance(
      req.params.numero_identificacion,
      req.query as Record<string, unknown>,
      req.user
    );
    return sendSuccess(res, "Desempeno del estudiante", data);
  }

  static async examSummary(req: Request, res: Response) {
    const data = await ReportService.examSummary(req.params.examId, req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Resumen de prueba", data);
  }

  static async examRanking(req: Request, res: Response) {
    const data = await ReportService.examRanking(req.params.examId, req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Ranking de prueba", data);
  }

  static async dashboardOverview(req: Request, res: Response) {
    const data = await ReportService.dashboardOverview(req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Resumen del dashboard", data);
  }

  static async filesCoverage(req: Request, res: Response) {
    const data = await ReportService.filesCoverage(req.query as Record<string, unknown>);
    return sendSuccess(res, "Cobertura documental de archivos", data);
  }

  static async filesCoverageExportCsv(req: Request, res: Response) {
    const result = await ReportService.filesCoverageExportCsv(req.query as Record<string, unknown>);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${result.fileName}\"`);
    return res.status(200).send(result.csv);
  }

  static async classroomSummary(req: Request, res: Response) {
    const data = await ReportService.classroomSummary(req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Resumen de aula", data);
  }

  static async classroomSummaryExportCsv(req: Request, res: Response) {
    const result = await ReportService.classroomSummaryExportCsv(req.query as Record<string, unknown>, req.user);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${result.fileName}\"`);
    return res.status(200).send(result.csv);
  }

  static async classroomSummaryExportPdf(req: Request, res: Response) {
    const result = await ReportService.classroomSummaryExportPdf(req.query as Record<string, unknown>, req.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${result.fileName}\"`);
    return res.status(200).send(result.pdfBuffer);
  }

  static async studentPerformanceExportCsv(req: Request, res: Response) {
    const result = await ReportService.studentPerformanceExportCsv(
      req.params.numero_identificacion,
      req.query as Record<string, unknown>,
      req.user
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${result.fileName}\"`);
    return res.status(200).send(result.csv);
  }

  static async studentPerformanceExportPdf(req: Request, res: Response) {
    const result = await ReportService.studentPerformanceExportPdf(
      req.params.numero_identificacion,
      req.query as Record<string, unknown>,
      req.user
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${result.fileName}\"`);
    return res.status(200).send(result.pdfBuffer);
  }

  static async questionsReadiness(req: Request, res: Response) {
    const data = await ReportService.questionsReadiness(req.query as Record<string, unknown>);
    return sendSuccess(res, "Cobertura de preguntas", data);
  }

  static async materialLocalCoverage(req: Request, res: Response) {
    const data = await ReportService.materialLocalCoverage();
    return sendSuccess(res, "Cobertura material local", data);
  }

  static async groupSummary(req: Request, res: Response) {
    const data = await ReportService.groupSummary(req.params.groupId, req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Resumen por grupo", data);
  }

  static async schoolSummary(req: Request, res: Response) {
    const data = await ReportService.schoolSummary(req.params.schoolId, req.query as Record<string, unknown>, req.user);
    return sendSuccess(res, "Resumen por colegio", data);
  }
}
