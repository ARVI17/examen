const HTML_TAG_PATTERN = /<[^>]*>/g;

export const sanitizeString = (value: string) => {
  return value.replace(HTML_TAG_PATTERN, "").trim();
};

export const sanitizeObject = (value: unknown): unknown => {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeObject(entry));
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, objectValue] of Object.entries(value)) {
      result[key] = sanitizeObject(objectValue);
    }
    return result;
  }

  return value;
};
