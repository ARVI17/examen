import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import attemptRoutes from "../modules/attempts/attempts.routes";
import examRoutes from "../modules/exams/exams.routes";
import fileRoutes from "../modules/files/files.routes";
import performanceLevelRoutes from "../modules/performance-levels/performance-levels.routes";
import questionRoutes from "../modules/questions/questions.routes";
import reportRoutes from "../modules/reports/reports.routes";
import studentRoutes from "../modules/students/students.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/students", studentRoutes);
router.use("/questions", questionRoutes);
router.use("/exams", examRoutes);
router.use("/attempts", attemptRoutes);
router.use("/reports", reportRoutes);
router.use("/performance-levels", performanceLevelRoutes);
router.use("/files", fileRoutes);

export default router;
