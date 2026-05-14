import { z } from "zod";

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();
const optionalText = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const normalized = normalizeSpaces(String(value));
    return normalized.length ? normalized : undefined;
  }, z.string().max(max).optional());

const optionalUpperText = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const normalized = normalizeSpaces(String(value)).toUpperCase();
    return normalized.length ? normalized : undefined;
  }, z.string().max(max).optional());

export const systemImportDryRunSchema = z.object({
  datasetId: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/i, "datasetId invalido")
    .optional(),
  departamento: optionalUpperText(120),
  municipio: optionalUpperText(120),
  search: optionalText(120),
  limit: z.coerce.number().int().min(1).max(10000).optional()
});

export const systemImportApplySchema = z.object({
  confirmText: z.string().trim().max(120),
  acceptedRisk: z.boolean(),
  datasetId: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/i, "datasetId invalido")
    .optional(),
  filters: z
    .object({
      departamento: optionalUpperText(120),
      municipio: optionalUpperText(120),
      search: optionalText(120)
    })
    .optional()
});

export const systemBackupSchema = z
  .object({
    assistantOnly: z.boolean().optional()
  })
  .optional()
  .transform((value) => value ?? {});

export const systemLocalPrepareSchema = z.object({
  confirmText: z.string().trim().max(160),
  acceptedDataLossRisk: z.boolean(),
  execute: z.boolean().optional(),
  withSchools: z.boolean().optional(),
  withDemoUsers: z.boolean().optional(),
  withAi: z.boolean().optional(),
  aiCount: z.coerce.number().int().min(1).max(10).optional(),
  departamento: optionalUpperText(120),
  backupFile: optionalText(260)
});

export const systemChecklistParamsSchema = z.object({
  itemId: z.string().trim().min(2).max(80).regex(/^[a-z0-9._-]+$/i, "itemId invalido")
});

export const systemChecklistUpdateSchema = z.object({
  checked: z.boolean(),
  note: optionalText(280)
});
