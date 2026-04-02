import fs from "fs";
import path from "path";
import { FileCategory, PrismaClient, QuestionArea } from "@prisma/client";

type ManifestRow = {
  year: string;
  area: string;
  kind?: string;
  type?: string;
  source_url: string;
  local_path: string;
  size_bytes: number;
  sha256: string;
  downloaded_at?: string;
  collected_at?: string;
};

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const getArgValue = (name: string, fallback: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return fallback;
  }

  const [_, raw] = prefixed.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
};

const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "storage");
const manifestPath = path.resolve(
  process.cwd(),
  getArgValue(
    "manifest",
    path.join("storage", "bancos_preguntas", "icfes", "cuadernillos", "manifest_cuadernillos_practica.json")
  )
);

const areaMap: Record<string, QuestionArea | null> = {
  lectura_critica: QuestionArea.LECTURA_CRITICA,
  matematicas: QuestionArea.MATEMATICAS,
  sociales_ciudadanas: QuestionArea.SOCIALES_CIUDADANAS,
  ciencias_naturales: QuestionArea.CIENCIAS_NATURALES,
  ingles: QuestionArea.INGLES,
  general: null
};

const resolveKind = (row: ManifestRow) => {
  return String(row.kind ?? row.type ?? "material").toLowerCase();
};

const mapCategoryByKind = (kind: string) => {
  const normalized = kind.toLowerCase();
  if (normalized.includes("informe")) {
    return FileCategory.REPORTES;
  }

  if (normalized.includes("guia")) {
    return FileCategory.MATERIALES_APOYO;
  }

  if (
    normalized.includes("marco") ||
    normalized.includes("nivel") ||
    normalized.includes("infografia") ||
    normalized.includes("mr_")
  ) {
    return FileCategory.MATERIALES_APOYO;
  }

  return FileCategory.BANCOS_PREGUNTAS;
};

const buildTipoPrueba = (row: ManifestRow) => {
  const normalizedKind = resolveKind(row);
  if (normalizedKind.includes("guia")) {
    return `Saber 11 - guia orientacion ${row.year}`;
  }

  if (normalizedKind.includes("cuadernillo")) {
    return `Saber 11 - cuadernillo practica ${row.year}`;
  }

  if (normalizedKind.includes("practica")) {
    return `Saber 11 - practica ${row.year}`;
  }

  if (normalizedKind.includes("informe")) {
    return `Saber 11 - informe ${row.year}`;
  }

  if (normalizedKind.includes("infografia")) {
    return `Saber 11 - infografia ${row.year}`;
  }

  if (normalizedKind.includes("marco") || normalizedKind.includes("nivel")) {
    return `Saber 11 - marco/niveles ${row.year}`;
  }

  return `Saber 11 - material ${row.year}`;
};

const resolveExistingFilePath = (inputPath: string) => {
  const candidates = new Set<string>();
  const normalized = String(inputPath).replace(/\\/g, "/");

  candidates.add(path.resolve(inputPath));

  const examenMarker = "/examen/";
  const examenIndex = normalized.toLowerCase().indexOf(examenMarker);
  if (examenIndex >= 0) {
    const relative = normalized.slice(examenIndex + examenMarker.length);
    candidates.add(path.resolve(process.cwd(), relative));
    candidates.add(path.resolve("/app", relative));
  }

  const storageMarker = "/storage/";
  const storageIndex = normalized.toLowerCase().indexOf(storageMarker);
  if (storageIndex >= 0) {
    const relativeStorage = normalized.slice(storageIndex + 1); // storage/...
    candidates.add(path.resolve(process.cwd(), relativeStorage));
    candidates.add(path.resolve("/app", relativeStorage));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const toRelativeStoragePath = (absolutePath: string) => {
  const relativePath = path.relative(storageRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Ruta fuera de storage: ${absolutePath}`);
  }
  return relativePath.split(path.sep).join("/");
};

const safeReadManifest = (): ManifestRow[] => {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe el manifiesto: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf-8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("El manifiesto no tiene formato de arreglo.");
  }

  return parsed as ManifestRow[];
};

const buildDescription = (row: ManifestRow) => {
  const resolvedKind = resolveKind(row);
  return [
    `Fuente: ${row.source_url}`,
    `SHA256: ${row.sha256}`,
    `Tipo: ${resolvedKind}`,
    `Anio: ${row.year}`,
    `Descargado: ${row.downloaded_at ?? row.collected_at ?? "N/A"}`
  ].join(" | ");
};

const ingest = async () => {
  const rows = safeReadManifest();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const absolutePath = resolveExistingFilePath(row.local_path);
    if (!absolutePath) {
      console.warn(`SKIP missing file: ${row.local_path}`);
      skipped += 1;
      continue;
    }

    const relativePath = toRelativeStoragePath(absolutePath);
    const existing = await prisma.fileAsset.findFirst({
      where: { ruta: relativePath }
    });

    const fileName = path.basename(absolutePath);
    const extension = path.extname(fileName).toLowerCase();
    const area = areaMap[row.area] ?? null;
    const description = buildDescription(row);
    const rowKind = resolveKind(row);
    const categoria = mapCategoryByKind(rowKind);
    const tipoPrueba = buildTipoPrueba(row);

    if (existing) {
      await prisma.fileAsset.update({
        where: { id: existing.id },
        data: {
          descripcion: description,
          area,
          gradoObjetivo: "11",
          tipoPrueba,
          categoria,
          activo: true,
          isCurrent: true,
          deletedAt: null
        }
      });
      updated += 1;
      continue;
    }

    await prisma.fileAsset.create({
      data: {
        nombreOriginal: fileName,
        nombreArchivo: fileName,
        categoria,
        tipoMime: "application/pdf",
        extension,
        pesoBytes: Number(row.size_bytes),
        ruta: relativePath,
        rutaLogica: relativePath,
        descripcion: description,
        gradoObjetivo: "11",
        area,
        tipoPrueba,
        version: 1,
        activo: true,
        isCurrent: true
      }
    });
    created += 1;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        manifestPath,
        totalRows: rows.length,
        created,
        updated,
        skipped
      },
      null,
      2
    )
  );
};

ingest()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          message: error instanceof Error ? error.message : "Error de ingesta"
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
