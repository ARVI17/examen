import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

type RawRow = Record<string, string | undefined>;

type NormalizedSchool = {
  departamento: string;
  municipio: string;
  establecimiento: string;
  sede: string | null;
  sectorOriginal: string;
  sectorNormalizado: "OFICIAL" | "NO OFICIAL";
  codigoDane: string | null;
  direccion: string | null;
  zona: string | null;
  estado: string | null;
  fuente: string;
  fechaConsulta: string;
  etiqueta: string;
  dedupKey: string;
  code: string;
};

type ImportStats = {
  mode: "dry-run" | "apply";
  sourceType: "socrata" | "csv";
  source: string;
  sourceAttribution?: string;
  sourceUpdatedAt?: string;
  fetchedAt: string;
  totalRead: number;
  normalized: number;
  inserted: number;
  updated: number;
  omitted: number;
  duplicatesInInput: number;
  errors: number;
  sampleLabels: string[];
  notes: string[];
};

const prisma = new PrismaClient();
const argv = process.argv.slice(2);

const hasFlag = (name: string) => argv.includes(`--${name}`);
const getArgValue = (name: string, fallback: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return fallback;
  }
  const [, raw] = prefixed.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
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

const isTruthyStatus = (value: string | null) => {
  if (!value) {
    return true;
  }
  const normalized = normalizeUpper(value);
  if (normalized.includes("INACT") || normalized.includes("CERRA") || normalized.includes("SUSPEND")) {
    return false;
  }
  return true;
};

const normalizeSector = (value: string) => {
  const normalized = normalizeUpper(value);
  if (!normalized) {
    return "NO OFICIAL" as const;
  }
  if (normalized.includes("NO OFICIAL")) {
    return "NO OFICIAL" as const;
  }
  if (normalized.includes("PRIVAD")) {
    return "NO OFICIAL" as const;
  }
  if (normalized.includes("OFICIAL") || normalized.includes("PUBLIC")) {
    return "OFICIAL" as const;
  }
  return "NO OFICIAL" as const;
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
      const hasData = row.some((item) => item.trim().length > 0);
      if (hasData) {
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
    const hasData = row.some((item) => item.trim().length > 0);
    if (hasData) {
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

  const headers = matrix[0].map((header) => normalizeHeader(header));

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
    const value = row[normalizeHeader(alias)] ?? row[alias];
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

const makeCode = (dedupKey: string, codigoDane: string | null) => {
  if (codigoDane) {
    return `DANE_${codigoDane}`.slice(0, 80);
  }
  const digest = crypto.createHash("sha1").update(dedupKey).digest("hex").slice(0, 20).toUpperCase();
  return `MAG_${digest}`;
};

const normalizeRow = (
  row: RawRow,
  sourceName: string,
  fetchedAt: string,
  defaultDepartamento: string
): NormalizedSchool | null => {
  const departamentoRaw =
    pick(row, ["departamento", "nombre_departamento"]) ||
    pick(row, ["dpto", "depto"]) ||
    defaultDepartamento;
  const departamento = normalizeUpper(departamentoRaw || defaultDepartamento);

  const municipio = normalizeUpper(pick(row, ["municipio", "nombre_municipio", "ciudad", "town"]));
  const establecimiento = normalizeText(
    pick(row, [
      "nombre_institucion_educativa",
      "nombre_institucion",
      "institucion_educativa_principal",
      "establecimiento",
      "nombre_establecimiento",
      "institucion"
    ])
  );

  if (!municipio || !establecimiento) {
    return null;
  }

  const sedeRaw = normalizeText(pick(row, ["nombre_sede", "sede", "nombre_sede_establecimiento_educativo"]));
  const sede = sedeRaw ? normalizeUpper(sedeRaw) : null;

  const sectorOriginal = normalizeText(pick(row, ["sector", "sector_original", "publica_o_privada", "p_blica_o_privada"]));
  const sectorNormalizado = normalizeSector(sectorOriginal);

  const codigoDaneRaw = normalizeText(
    pick(row, [
      "codigo_dane",
      "codigo_dane_establecimiento",
      "codigo_establecimiento_educativo",
      "codigo_establecimiento",
      "codigo_sede"
    ])
  );
  const codigoDane = codigoDaneRaw ? codigoDaneRaw.replace(/[^0-9A-Za-z]/g, "") : null;

  const direccion = normalizeText(pick(row, ["direccion_sede", "direccion", "direcci_n", "ubicacion"])) || null;
  const zona = normalizeText(pick(row, ["zona", "zona_sede", "zona_geografica", "zona_geogr_fica"])) || null;
  const estado = normalizeText(pick(row, ["estado", "estado_sede", "situacion"])) || null;

  const etiqueta = buildLabel({
    departamento,
    municipio,
    establecimiento,
    sede,
    sectorNormalizado
  });

  const dedupKey = codigoDane
    ? `DANE:${codigoDane}`
    : `${departamento}|${municipio}|${normalizeUpper(establecimiento)}|${sede ?? "SIN_SEDE"}|${sectorNormalizado}`;

  return {
    departamento,
    municipio,
    establecimiento,
    sede,
    sectorOriginal,
    sectorNormalizado,
    codigoDane,
    direccion,
    zona,
    estado,
    fuente: sourceName,
    fechaConsulta: fetchedAt,
    etiqueta,
    dedupKey,
    code: makeCode(dedupKey, codigoDane)
  };
};

const fetchSocrataRows = async (datasetId: string) => {
  const metaUrl = `https://www.datos.gov.co/api/views/${datasetId}`;
  const metaResponse = await fetch(metaUrl, { headers: { Accept: "application/json" } });
  if (!metaResponse.ok) {
    throw new Error(`No se pudo consultar metadata Socrata (${metaResponse.status})`);
  }
  const meta = (await metaResponse.json()) as {
    name?: string;
    attribution?: string;
    rowsUpdatedAt?: number;
  };

  const rows: RawRow[] = [];
  const pageSize = 50000;
  let offset = 0;

  while (true) {
    const dataUrl = `https://www.datos.gov.co/resource/${datasetId}.json?$limit=${pageSize}&$offset=${offset}`;
    const response = await fetch(dataUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`No se pudo descargar dataset Socrata (${response.status})`);
    }

    const chunk = (await response.json()) as Array<Record<string, unknown>>;
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

    if (chunk.length < pageSize) {
      break;
    }
    offset += chunk.length;
  }

  return {
    rows,
    sourceName: meta.name || `Socrata ${datasetId}`,
    sourceAttribution: meta.attribution || "",
    sourceUpdatedAt: meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString() : undefined
  };
};

const ensureDir = (filePath: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const main = async () => {
  const apply = hasFlag("apply");
  const datasetId = getArgValue("dataset-id", "c56g-ubd2");
  const csvPath = getArgValue("csv", path.join("storage", "materiales_apoyo", "colegios_magdalena.csv"));
  const reportPath = getArgValue(
    "report",
    path.join("storage", "reportes", "seed_magdalena_schools_log.json")
  );
  const departamentoDefault = normalizeUpper(getArgValue("departamento", "MAGDALENA"));
  const sourceMode = getArgValue("source", "auto").toLowerCase();

  let sourceType: "socrata" | "csv" = "socrata";
  let sourceLabel = "";
  let sourceAttribution = "";
  let sourceUpdatedAt: string | undefined;
  let rawRows: RawRow[] = [];

  if (sourceMode === "csv" || (sourceMode === "auto" && fs.existsSync(csvPath))) {
    const absoluteCsvPath = path.resolve(process.cwd(), csvPath);
    if (!fs.existsSync(absoluteCsvPath)) {
      throw new Error(`CSV no encontrado: ${absoluteCsvPath}`);
    }

    const csvContent = fs.readFileSync(absoluteCsvPath, "utf8");
    rawRows = toRowsFromCsv(csvContent);
    sourceType = "csv";
    sourceLabel = absoluteCsvPath;
  } else {
    const socrata = await fetchSocrataRows(datasetId);
    rawRows = socrata.rows;
    sourceType = "socrata";
    sourceLabel = `https://www.datos.gov.co/resource/${datasetId}.json`;
    sourceAttribution = socrata.sourceAttribution;
    sourceUpdatedAt = socrata.sourceUpdatedAt;
  }

  const fetchedAt = new Date().toISOString();

  const stats: ImportStats = {
    mode: apply ? "apply" : "dry-run",
    sourceType,
    source: sourceLabel,
    sourceAttribution,
    sourceUpdatedAt,
    fetchedAt,
    totalRead: rawRows.length,
    normalized: 0,
    inserted: 0,
    updated: 0,
    omitted: 0,
    duplicatesInInput: 0,
    errors: 0,
    sampleLabels: [],
    notes: []
  };

  const seen = new Set<string>();
  const normalizedRows: NormalizedSchool[] = [];

  for (const raw of rawRows) {
    const normalized = normalizeRow(raw, sourceLabel, fetchedAt, departamentoDefault);
    if (!normalized) {
      stats.omitted += 1;
      continue;
    }

    if (seen.has(normalized.dedupKey)) {
      stats.duplicatesInInput += 1;
      continue;
    }

    seen.add(normalized.dedupKey);
    normalizedRows.push(normalized);
  }

  stats.normalized = normalizedRows.length;
  stats.sampleLabels = normalizedRows.slice(0, 8).map((row) => row.etiqueta);

  if (apply) {
    for (const item of normalizedRows) {
      try {
        const metadata = {
          departamento: item.departamento,
          municipio: item.municipio,
          establecimiento: item.establecimiento,
          sede: item.sede,
          sector_original: item.sectorOriginal,
          sector_normalizado: item.sectorNormalizado,
          codigo_dane: item.codigoDane,
          direccion: item.direccion,
          zona: item.zona,
          estado: item.estado,
          fuente: item.fuente,
          fecha_consulta: item.fechaConsulta,
          etiqueta: item.etiqueta
        };

        const isActive = isTruthyStatus(item.estado);

        const existing = await prisma.school.findUnique({ where: { code: item.code } });

        if (!existing) {
          await prisma.school.create({
            data: {
              code: item.code,
              name: item.etiqueta,
              description: JSON.stringify(metadata),
              isActive
            }
          });
          stats.inserted += 1;
        } else {
          const nextDescription = JSON.stringify(metadata);
          const needsUpdate =
            existing.name !== item.etiqueta ||
            existing.description !== nextDescription ||
            existing.isActive !== isActive;

          if (!needsUpdate) {
            stats.omitted += 1;
          } else {
            await prisma.school.update({
              where: { id: existing.id },
              data: {
                name: item.etiqueta,
                description: nextDescription,
                isActive
              }
            });
            stats.updated += 1;
          }
        }
      } catch (error) {
        stats.errors += 1;
        stats.notes.push(
          `Error fila ${item.code}: ${error instanceof Error ? error.message : "error desconocido"}`
        );
      }
    }
  } else {
    stats.notes.push("Ejecucion en dry-run. Usa --apply para persistir en base de datos.");
  }

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
          message: error instanceof Error ? error.message : "Error importando colegios del Magdalena"
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
