import { AppError } from "../errors/AppError";

export const parseDateRange = (from?: string, to?: string) => {
  if (!from && !to) {
    return undefined;
  }

  const range: { gte?: Date; lte?: Date } = {};

  if (from) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new AppError("Parametro 'from' invalido", 400, "VALIDATION_ERROR");
    }
    range.gte = fromDate;
  }

  if (to) {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new AppError("Parametro 'to' invalido", 400, "VALIDATION_ERROR");
    }
    range.lte = toDate;
  }

  return range;
};
