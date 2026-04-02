export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
}

export const getPagination = (
  rawQuery: Record<string, unknown>,
  defaultLimit = 20,
  maxLimit = 100
): PaginationOptions => {
  const page = Math.max(1, Number(rawQuery.page ?? 1) || 1);
  const requestedLimit = Math.max(1, Number(rawQuery.limit ?? defaultLimit) || defaultLimit);
  const limit = Math.min(requestedLimit, maxLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};
