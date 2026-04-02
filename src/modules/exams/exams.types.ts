import { ExamStatus, Prisma, QuestionArea } from "@prisma/client";
import { ExamTypeValue } from "./exams.constants";

export type ExamCreateInput = {
  nombre: string;
  descripcion?: string;
  tipoPrueba: ExamTypeValue;
  gradoObjetivo: string;
  estado: ExamStatus;
  tiempoLimiteMinutos: number;
  totalPreguntas: number;
  puntajeMaximo: number;
  instrucciones?: string;
  fechaPublicacion?: Date;
};

export type ExamUpdateInput = Partial<ExamCreateInput> & { fechaPublicacion?: Date | null; isDeleted?: boolean };

export type ExamQuestionAssignment = {
  questionId: string;
  orden?: number;
  puntajePregunta?: number;
  area?: QuestionArea;
  metadata?: Prisma.InputJsonValue;
};

