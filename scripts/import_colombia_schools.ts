import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

type RawRow = Record<string, string | undefined>;

type NormalizedSchool = {
  code: string;
  dedupKey: string;
  departamento: string;
  municipio: string;
  establecimiento: string;
  sede: string | null;
  sectorOriginal: string;
  sectorNormalizado: "OFICIAL" | "NO OFICIAL";
  codigoDane: string | null;
  direccion: string | null;
  zona: string | null;
  estadoFuente: string | null;
  fuente: string;
  fechaFuente: string;
  searchLabel: string;
  nombreNormalizado: string;
};

type ImportStats = {
  mode: "dry-run" | "apply";
  sourceType: "socrata" | "csv";
  source: string;
  sourceAttribution?: string;
  sourceUpdatedAt?: string;
  fetchedAt: string;
  durationMs: number;
  totalRead: number;
  totalAfterLimit: number;
  normalized: number;
  inserted: number;
  updated: number;
  omitted: number;
  duplicatesInInput: number;
  errors: number;
  oficiales: number;
  noOficiales: number;
  departamentos: number;
  municipios: number;
  sampleLabels: string[];
  notes: string[];
};

type DatasetCapability = {
  hasDepartamento: boolean;
  hasMunicipio: boolean;
};

const prisma = new PrismaClient();
const argv = process.argv.slice(2);

const hasFlag = (name: string) => argv.includes(`--${name}`);
const getArgValue = (name: string, fallback: string) => {
  const match = argv.find((value) => value.startsWith(`--${name}=`));
  if (!match) {
    return fallback;
  }
  const [, raw] = match.split("=", 2);
  return raw?.trim() || fallback;
};

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();
const normalizeUpper = (value: string) => normalizeSpaces(value).toUpperCase();
const normalizeText = (value: string) => normalizeSpaces(value);
const removeAccents = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeHeader = (value: string) =>
  removeAccents(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeForSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeSector = (value: string) => {
  const normalized = normalizeUpper(value);
  if (!normalized) {
    return "NO OFICIAL" as const;
  }
  if (normalized.includes("NO OFICIAL") || normalized.includes("PRIV")) {
    return "NO OFICIAL" as const;
  }
  if (normalized.includes("OFICIAL") || normalized.includes("PUBLIC")) {
    return "OFICIAL" as const;
  }
  return "NO OFICIAL" as const;
};

const isTruthyStatus = (value: string | null) => {
  if (!value) {
    return true;
  }
  const normalized = normalizeUpper(value);
  return !(normalized.includes("INACT") || normalized.includes("CERR") || normalized.includes("SUSPEN"));
};

const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"') {
      if (inQuotes && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
};

const toRowsFromCsv = (content: string): RawRow[] => {
  const matrix = parseCsv(content);
  if (matrix.length <= 1) {
    return [];
  }
  const headers = matrix[0].map((item) => normalizeHeader(item));
  return matrix.slice(1).map((cells) => {
    const row: RawRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index]?.trim() || undefined;
    });
    return row;
  });
};

const pick = (row: RawRow, aliases: string[]) => {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const value = row[key] ?? row[alias];
    if (typeof value === "string" && value.trim().length > 0) {
      return normalizeText(value);
    }
  }
  return "";
};

const buildLabel = (item: {
  departamento: string;
  municipio: string;
  establecimiento: string;
  sede: string | null;
  sectorNormalizado: "OFICIAL" | "NO OFICIAL";
}) => {
  const parts = [item.departamento, item.municipio, item.establecimiento];
  if (item.sede) {
    parts.push(item.sede);
  }
  parts.push(item.sectorNormalizado);
  return parts.join(" / ");
};

const toCode = (dedupKey: string, codigoDane: string | null) => {
  if (codigoDane) {
    return `DANE_${codigoDane}`.slice(0, 80);
  }
  const digest = crypto.createHash("sha1").update(dedupKey).digest("hex").slice(0, 24).toUpperCase();
  return `COL_${digest}`;
};

const normalizeRow = (
  row: RawRow,
  fetchedAt: string,
  sourceName: string,
  defaultDepartment: string
): NormalizedSchool | null => {
  const departamentoRaw =
    pick(row, [
      "departamento",
      "nombre_departamento",
      "departamento_nombre",
      "nombredepartamento",
      "cod_dane_departamento",
      "codigodepartamento",
      "depto",
      "dpto"
    ]) || defaultDepartment;
  const municipioRaw = pick(row, [
    "municipio",
    "nombre_municipio",
    "municipio_nombre",
    "nombremunicipio",
    "cod_dane_municipio",
    "codigomunicipio",
    "ciudad"
  ]);
  const establecimientoRaw = pick(row, [
    "nombre",
    "institucion",
    "nombre_institucion_educativa",
    "nombre_institucion",
    "institucion_educativa_principal",
    "establecimiento",
    "nombre_establecimiento",
    "nombreestablecimiento"
  ]);

  const departamento = normalizeUpper(departamentoRaw);
  const municipio = normalizeUpper(municipioRaw);
  const establecimiento = normalizeUpper(establecimientoRaw);

  const resolvedDepartamento =
    departamento === "COLOMBIA" ? (defaultDepartment && defaultDepartment !== "COLOMBIA" ? defaultDepartment : "") : departamento;

  if (!resolvedDepartamento || !municipio || !establecimiento) {
    return null;
  }

  const sedeRaw = normalizeText(pick(row, ["sede", "nombre_sede", "nombre_sede_establecimiento_educativo"]));
  const sede = sedeRaw ? normalizeUpper(sedeRaw) : null;

  const sectorOriginal = normalizeText(
    pick(row, ["sector", "naturaleza", "oficial_no_oficial", "sector_original", "publica_o_privada", "p_blica_o_privada"])
  );
  const sectorNormalizado = normalizeSector(sectorOriginal);

  const codigoDaneRaw = normalizeText(
    pick(row, [
      "codigo_dane",
      "cod_dane",
      "dane",
      "codigo_dane_establecimiento",
      "codigoestablecimiento",
      "codigo_establecimiento_educativo",
      "codigo_establecimiento",
      "codigo_sede"
    ])
  );
  const codigoDane = codigoDaneRaw ? codigoDaneRaw.replace(/[^0-9A-Za-z]/g, "") : null;

  const direccion = normalizeText(pick(row, ["direccion", "direccion_sede", "direcci_n", "ubicacion"])) || null;
  const zona = normalizeText(pick(row, ["zona", "zona_sede", "zona_geografica", "zona_geogr_fica"])) || null;
  const estadoFuente = normalizeText(pick(row, ["estado", "estado_sede", "situacion"])) || null;

  const dedupKey = codigoDane
    ? `DANE:${codigoDane}`
    : `${resolvedDepartamento}|${municipio}|${establecimiento}|${sede ?? "SIN_SEDE"}|${sectorNormalizado}`;
  const code = toCode(dedupKey, codigoDane);
  const searchLabel = buildLabel({ departamento: resolvedDepartamento, municipio, establecimiento, sede, sectorNormalizado });
  const nombreNormalizado = normalizeForSearch(`${establecimiento} ${sede ?? ""}`.trim());

  return {
    code,
    dedupKey,
    departamento: resolvedDepartamento,
    municipio,
    establecimiento,
    sede,
    sectorOriginal,
    sectorNormalizado,
    codigoDane,
    direccion,
    zona,
    estadoFuente,
    fuente: sourceName,
    fechaFuente: fetchedAt,
    searchLabel,
    nombreNormalizado
  };
};

const fetchSocrataRows = async (datasetId: string, maxRecords = 0) => {
  const metaUrl = `https://www.datos.gov.co/api/views/${datasetId}`;
  const metaRes = await fetch(metaUrl, { headers: { Accept: "application/json" } });
  if (!metaRes.ok) {
    throw new Error(`No se pudo consultar metadata Socrata (${metaRes.status})`);
  }
  const meta = (await metaRes.json()) as {
    name?: string;
    attribution?: string;
    rowsUpdatedAt?: number;
  };

  const rows: RawRow[] = [];
  const pageSize = 50000;
  let offset = 0;

  while (true) {
    const remaining = maxRecords > 0 ? Math.max(0, maxRecords - rows.length) : pageSize;
    if (maxRecords > 0 && remaining === 0) {
      break;
    }
    const currentLimit = maxRecords > 0 ? Math.min(pageSize, remaining) : pageSize;
    const url = `https://www.datos.gov.co/resource/${datasetId}.json?$limit=${currentLimit}&$offset=${offset}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`No se pudo descargar dataset Socrata (${res.status})`);
    }
    const chunk = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    for (const item of chunk) {
      const row: RawRow = {};
      for (const [key, value] of Object.entries(item)) {
        if (value === null || value === undefined) {
          continue;
        }
        row[normalizeHeader(key)] = normalizeText(String(value));
      }
      rows.push(row);
    }

    if (chunk.length < currentLimit) {
      break;
    }
    offset += chunk.length;
  }

  return {
    rows,
    sourceName: meta.name || `Socrata ${datasetId}`,
    sourceAttribution: meta.attribution || "",
    sourceUpdatedAt: meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString() : undefined,
    columns: Array.isArray((meta as unknown as { columns?: Array<{ fieldName?: string }> }).columns)
      ? (((meta as unknown as { columns?: Array<{ fieldName?: string }> }).columns || [])
          .map((col) => normalizeHeader(String(col.fieldName || "")))
          .filter(Boolean) as string[])
      : []
  };
};

const validateCapability = (columns: string[]): DatasetCapability => {
  const columnSet = new Set(columns.map((col) => normalizeHeader(col)));
  const hasAny = (aliases: string[]) => aliases.some((alias) => columnSet.has(normalizeHeader(alias)));

  const hasDepartamento = hasAny([
    "departamento",
    "nombre_departamento",
    "departamento_nombre",
    "nombredepartamento",
    "cod_dane_departamento",
    "codigodepartamento",
    "depto",
    "dpto"
  ]);
  const hasMunicipio = hasAny([
    "municipio",
    "nombre_municipio",
    "municipio_nombre",
    "nombremunicipio",
    "cod_dane_municipio",
    "codigomunicipio",
    "ciudad"
  ]);

  return { hasDepartamento, hasMunicipio };
};

const ensureDir = (filePath: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const main = async () => {
  const startedAt = Date.now();
  const apply = hasFlag("apply");
  const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
  const localProductionPrepare = (process.env.LOCAL_PRODUCTION_PREPARE || "").trim().toLowerCase() === "true";
  const confirmLocalProduction = hasFlag("confirm-local-production");
  const sourceMode = getArgValue("source", "auto").toLowerCase();
  const datasetId = getArgValue("dataset-id", "cfw5-qzt5");
  const csvPath = getArgValue("csv", path.join("storage", "materiales_apoyo", "colegios_colombia.csv"));
  const departmentFilter = normalizeUpper(getArgValue("departamento", ""));
  const municipalityFilter = normalizeUpper(getArgValue("municipio", ""));
  const searchFilter = normalizeForSearch(getArgValue("search", ""));
  const defaultDepartment = normalizeUpper(getArgValue("default-departamento", departmentFilter));
  const limit = Number(getArgValue("limit", "0"));
  const reportPath = getArgValue("report", path.join("storage", "reportes", "seed_colombia_schools_log.json"));

  if (apply && nodeEnv === "production" && (!localProductionPrepare || !confirmLocalProduction)) {
    throw new Error(
      "Bloqueado en production: usa LOCAL_PRODUCTION_PREPARE=true y --confirm-local-production para importacion real controlada."
    );
  }

  let sourceType: "socrata" | "csv" = "socrata";
  let source = "";
  let sourceAttribution = "";
  let sourceUpdatedAt: string | undefined;
  let rawRows: RawRow[] = [];
  let capability: DatasetCapability | null = null;

  const csvAbsPath = path.resolve(process.cwd(), csvPath);
  if (sourceMode === "csv" || (sourceMode === "auto" && fs.existsSync(csvAbsPath))) {
    if (!fs.existsSync(csvAbsPath)) {
      throw new Error(`CSV no encontrado: ${csvAbsPath}`);
    }
    rawRows = toRowsFromCsv(fs.readFileSync(csvAbsPath, "utf8"));
    sourceType = "csv";
    source = csvAbsPath;
    const firstRowKeys = rawRows.length > 0 ? Object.keys(rawRows[0]).map((key) => normalizeHeader(key)) : [];
    capability = validateCapability(firstRowKeys);
  } else {
    const socrata = await fetchSocrataRows(datasetId, Number.isFinite(limit) && limit > 0 ? limit : 0);
    rawRows = socrata.rows;
    sourceType = "socrata";
    source = `https://www.datos.gov.co/resource/${datasetId}.json`;
    sourceAttribution = socrata.sourceAttribution;
    sourceUpdatedAt = socrata.sourceUpdatedAt;
    capability = validateCapability(socrata.columns);
  }

  if (!capability?.hasDepartamento || !capability?.hasMunicipio) {
    throw new Error(
      "La fuente seleccionada no contiene departamento/municipio; use una fuente de sedes o CSV oficial con esas columnas."
    );
  }

  const fetchedAt = new Date().toISOString();
  const rowsAfterLimit = Number.isFinite(limit) && limit > 0 ? rawRows.slice(0, limit) : rawRows;

  const stats: ImportStats = {
    mode: apply ? "apply" : "dry-run",
    sourceType,
    source,
    sourceAttribution,
    sourceUpdatedAt,
    fetchedAt,
    durationMs: 0,
    totalRead: rawRows.length,
    totalAfterLimit: rowsAfterLimit.length,
    normalized: 0,
    inserted: 0,
    updated: 0,
    omitted: 0,
    duplicatesInInput: 0,
    errors: 0,
    oficiales: 0,
    noOficiales: 0,
    departamentos: 0,
    municipios: 0,
    sampleLabels: [],
    notes: []
  };

  const seen = new Set<string>();
  const departments = new Set<string>();
  const municipalities = new Set<string>();
  const normalizedRows: NormalizedSchool[] = [];

  for (const raw of rowsAfterLimit) {
    const normalized = normalizeRow(raw, fetchedAt, source, defaultDepartment);
    if (!normalized) {
      stats.omitted += 1;
      continue;
    }

    if (departmentFilter && normalized.departamento !== departmentFilter) {
      continue;
    }
    if (municipalityFilter && normalized.municipio !== municipalityFilter) {
      continue;
    }
    if (searchFilter) {
      const candidate = normalizeForSearch(
        `${normalized.searchLabel} ${normalized.establecimiento} ${normalized.sede ?? ""} ${normalized.codigoDane ?? ""}`.trim()
      );
      if (!candidate.includes(searchFilter)) {
        continue;
      }
    }

    if (seen.has(normalized.dedupKey)) {
      stats.duplicatesInInput += 1;
      continue;
    }

    seen.add(normalized.dedupKey);
    normalizedRows.push(normalized);
    departments.add(normalized.departamento);
    municipalities.add(`${normalized.departamento}::${normalized.municipio}`);
    if (normalized.sectorNormalizado === "OFICIAL") {
      stats.oficiales += 1;
    } else {
      stats.noOficiales += 1;
    }
  }

  stats.normalized = normalizedRows.length;
  stats.departamentos = departments.size;
  stats.municipios = municipalities.size;
  stats.sampleLabels = normalizedRows.slice(0, 10).map((row) => row.searchLabel);

  if (apply) {
    for (const school of normalizedRows) {
      try {
        const schoolName = school.sede ? `${school.establecimiento} / ${school.sede}` : school.establecimiento;
        const isActive = isTruthyStatus(school.estadoFuente);
        const existing = await prisma.school.findUnique({ where: { code: school.code } });
        const payload = {
          code: school.code,
          name: schoolName,
          establecimiento: school.establecimiento,
          sede: school.sede,
          departamento: school.departamento,
          municipio: school.municipio,
          sectorOriginal: school.sectorOriginal || null,
          sectorNormalizado: school.sectorNormalizado,
          zona: school.zona,
          direccion: school.direccion,
          codigoDane: school.codigoDane,
          estadoFuente: school.estadoFuente,
          fuente: school.fuente,
          fechaFuente: new Date(school.fechaFuente),
          searchLabel: school.searchLabel,
          nombreNormalizado: school.nombreNormalizado,
          isActive,
          description: `Catalogo oficial: ${school.searchLabel}`
        };

        if (!existing) {
          await prisma.school.create({ data: payload });
          stats.inserted += 1;
          continue;
        }

        const changed =
          existing.name !== payload.name ||
          existing.establecimiento !== payload.establecimiento ||
          existing.sede !== payload.sede ||
          existing.departamento !== payload.departamento ||
          existing.municipio !== payload.municipio ||
          existing.sectorOriginal !== payload.sectorOriginal ||
          existing.sectorNormalizado !== payload.sectorNormalizado ||
          existing.zona !== payload.zona ||
          existing.direccion !== payload.direccion ||
          existing.codigoDane !== payload.codigoDane ||
          existing.estadoFuente !== payload.estadoFuente ||
          existing.fuente !== payload.fuente ||
          existing.searchLabel !== payload.searchLabel ||
          existing.nombreNormalizado !== payload.nombreNormalizado ||
          existing.isActive !== payload.isActive;

        if (!changed) {
          stats.omitted += 1;
          continue;
        }

        await prisma.school.update({
          where: { id: existing.id },
          data: payload
        });
        stats.updated += 1;
      } catch (error) {
        stats.errors += 1;
        stats.notes.push(
          `Error ${school.code}: ${error instanceof Error ? error.message : "error desconocido"}`
        );
      }
    }
  } else {
    stats.notes.push("Ejecucion en dry-run. Usa --apply para persistir cambios.");
  }

  stats.durationMs = Date.now() - startedAt;
  ensureDir(reportPath);
  fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        success: stats.errors === 0,
        ...stats,
        reportPath
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          message: error instanceof Error ? error.message : "Error importando colegios Colombia"
        },
        null,
        2
      )
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
