import { DocumentTypeCode, QuestionArea } from "@prisma/client";

export type AttemptSession = {
  id: string;
  label: string;
  questionStart: number;
  questionEnd: number;
  questionCount: number;
  durationMinutes: number;
  suggestedStart: string | null;
  suggestedEnd: string | null;
  description: string;
};

export type AttemptSessionPlan = {
  mode: "SIMPLE" | "SABER11_DOS_JORNADAS";
  totalQuestions: number;
  totalMinutes: number;
  sessions: AttemptSession[];
};

export type AttemptSessionControl = {
  strictMode: boolean;
  currentSessionIndex: number;
  session1CompletedAt: string | null;
  session2Enabled: boolean;
  session2EnabledAt: string | null;
  session2EnabledBy: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
  restartedFromAttemptId: string | null;
};

export type AttemptPresentation = {
  questionOrder: string[];
  optionOrderByQuestion: Record<string, string[]>;
  sessionPlan: AttemptSessionPlan;
  sessionControl: AttemptSessionControl;
};

export type StartAttemptInput = {
  pruebaId: string;
  estudiante?: {
    nombres: string;
    apellidos: string;
    tipoIdentificacion: DocumentTypeCode;
    numeroIdentificacion: string;
    grado: string;
    grupo?: string;
    institucion?: string;
    schoolId?: string;
    groupId?: string;
  };
  estudianteRegistrado?: {
    tipoIdentificacion?: DocumentTypeCode;
    numeroIdentificacion: string;
  };
  strictMode?: boolean;
};

export type AnswerAttemptInput = {
  preguntaId: string;
  opcionIdSeleccionada: string;
  tiempoRespuestaSegundos?: number;
};

export type StopAttemptInput = {
  motivo?: string;
};

export type AreaStats = {
  area: QuestionArea;
  totalPreguntasArea: number;
  correctas: number;
  incorrectas: number;
  puntajeArea: number;
  porcentajeArea: number;
  nivelDesempenoArea: string;
};

