import { DocumentTypeCode, QuestionArea } from "@prisma/client";

export type StartAttemptInput = {
  pruebaId: string;
  estudiante: {
    nombres: string;
    apellidos: string;
    tipoIdentificacion: DocumentTypeCode;
    numeroIdentificacion: string;
    grado: string;
  };
};

export type AnswerAttemptInput = {
  preguntaId: string;
  opcionIdSeleccionada: string;
  tiempoRespuestaSegundos?: number;
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

