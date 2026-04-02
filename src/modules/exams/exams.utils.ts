import { EXAM_TYPE_ALIASES, EXAM_TYPE_VALUES, ExamTypeValue } from "./exams.constants";

export const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const removeAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeExamType = (raw: string): string => {
  const normalized = removeAccents(raw).trim().toUpperCase();
  const compact = normalized.replace(/[\s-]+/g, "_");

  if (EXAM_TYPE_ALIASES[normalized]) {
    return EXAM_TYPE_ALIASES[normalized];
  }

  if (EXAM_TYPE_ALIASES[compact]) {
    return EXAM_TYPE_ALIASES[compact];
  }

  return compact;
};

export const isSupportedExamType = (value: string): value is ExamTypeValue =>
  EXAM_TYPE_VALUES.includes(value as ExamTypeValue);

export const normalizeGradoObjetivo = (value: string) => normalizeSpaces(value).toUpperCase();
