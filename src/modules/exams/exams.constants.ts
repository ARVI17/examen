export const EXAM_TYPE_VALUES = [
  "SIMULACRO",
  "DIAGNOSTICO",
  "EVALUACION",
  "PRACTICA",
  "SABER_11"
] as const;

export type ExamTypeValue = (typeof EXAM_TYPE_VALUES)[number];

export const EXAM_TYPE_ALIASES: Record<string, ExamTypeValue> = {
  SIMULACRO: "SIMULACRO",
  DIAGNOSTICO: "DIAGNOSTICO",
  EVALUACION: "EVALUACION",
  PRACTICA: "PRACTICA",
  SABER_11: "SABER_11",
  SABER11: "SABER_11",
  "SABER-11": "SABER_11",
  "SABER 11": "SABER_11"
};

export const GRADE_OBJECTIVE_REGEX = /^(?:[1-9]|1[0-1])(?:[A-Za-z])?$/;
