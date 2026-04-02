import { QuestionArea, QuestionDifficulty, QuestionType } from "@prisma/client";

export type QuestionOptionInput = {
  texto_opcion: string;
  es_correcta: boolean;
  orden?: number;
};

export type QuestionCreateInput = {
  codigoInterno: string;
  area: QuestionArea;
  competencia: string;
  componente: string;
  nivelDificultad: QuestionDifficulty;
  nivelCognitivo: string;
  enunciado: string;
  contextoTextoBase?: string;
  tipoPregunta: QuestionType;
  gradoObjetivo: string;
  estado: boolean;
  explicacionRespuesta?: string;
  observacionesDocente?: string;
  options: QuestionOptionInput[];
};

export type QuestionUpdateInput = Partial<Omit<QuestionCreateInput, "codigoInterno">>;
