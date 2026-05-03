import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { FileCategory, PrismaClient, QuestionArea } from "@prisma/client";
import { FILE_CATEGORY_DIRECTORY } from "../src/modules/files/files.constants";

type ManifestItem = {
  source_relative_path: string;
  source_absolute_path: string;
  coleccion: string;
  area_refinada: string;
  area_proyecto: QuestionArea | null;
  categoria_proyecto: FileCategory;
  tipo_prueba_proyecto: string;
  grado_objetivo: string;
  extension: string;
  size_bytes: number;
  size_kb: number;
  sha256: string;
  confidence: string;
  reason: string;
  ingest_priority: string;
  descripcion_sugerida: string;
};

type ManifestRoot = {
  generated_at: string;
  source_root: string;
  total_files: number;
  files: ManifestItem[];
};

const prisma = new PrismaClient();
const argv = process.argv.slice(2);

const hasFlag = (name: string) => argv.includes(`--${name}`);

const getArgValue = (name: string, fallback: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return fallback;
  }

  const [_, raw] = prefixed.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
};

const parsePriorities = (value: string) => {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
};

const manifestPath = path.resolve(
  process.cwd(),
  getArgValue("manifest", path.join("storage", "bancos_preguntas", "icfes", "material_local", "manifest_material_local.json"))
);
const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "storage");
const shouldApply = hasFlag("apply");
const priorities = parsePriorities(getArgValue("priorities", "alta,media"));
const limit = Number(getArgValue("limit", "0"));

const sanitizeSegment = (value: string) => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
};

const sanitizeBaseName = (name: string) => {
  const ext = path.extname(name).toLowerCase();
  const rawBase = path.basename(name, ext);
  const safeBase = sanitizeSegment(rawBase) || "archivo";
  return { ext, safeBase };
};

const buildInternalFileName = (originalName: string) => {
  const { ext, safeBase } = sanitizeBaseName(originalName);
  return `${Date.now()}-${randomUUID()}-${safeBase}${ext}`;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const detectMimeType = (extension: string) => {
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? "application/octet-stream";
};

const detectYear = (item: ManifestItem) => {
  const candidates = [item.source_relative_path, item.descripcion_sugerida, item.tipo_prueba_proyecto];
  for (const candidate of candidates) {
    const match = candidate.match(/\b(20\d{2})\b/);
    if (!match) {
      continue;
    }
    const year = Number(match[1]);
    if (year >= 2000 && year <= 2100) {
      return String(year);
    }
  }
  return String(new Date().getFullYear());
};

const ensureDirectory = (directoryPath: string) => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

const toRelativeStoragePath = (absolutePath: string) => {
  const relativePath = path.relative(storageRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Ruta fuera de storage: ${absolutePath}`);
  }
  return relativePath.split(path.sep).join("/");
};

const readManifest = (): ManifestRoot => {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe el manifiesto: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf-8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw) as ManifestRoot;

  if (!parsed || !Array.isArray(parsed.files)) {
    throw new Error("El manifiesto no tiene formato valido.");
  }

  return parsed;
};

const parseDescriptionMetadata = (description?: string | null) => {
  const text = description ?? "";
  const read = (key: string) => {
    const regex = new RegExp(`${key}=([^|]+)`, "i");
    const match = text.match(regex);
    return match?.[1]?.trim() ?? null;
  };

  return {
    sha256: read("SHA256"),
    priority: read("Priority"),
    confidence: read("Confidence")
  };
};

const buildAssetDescription = (item: ManifestItem, sourceLogicalPath: string) => {
  return [
    item.descripcion_sugerida,
    `SourcePath=${sourceLogicalPath}`,
    `Priority=${item.ingest_priority}`,
    `Confidence=${item.confidence}`,
    `SHA256=${item.sha256}`,
    `Rule=${item.reason}`
  ].join(" | ");
};

const resolveSourcePath = (item: ManifestItem) => {
  const candidates = new Set<string>();
  candidates.add(path.resolve(item.source_absolute_path));

  const normalizedRelative = item.source_relative_path.replace(/\\/g, path.sep);
  candidates.add(path.resolve(process.cwd(), "material", normalizedRelative));
  candidates.add(path.resolve(process.cwd(), normalizedRelative));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const ingest = async () => {
  const manifest = readManifest();
  const selected = manifest.files.filter((item) => priorities.has(item.ingest_priority.toLowerCase()));
  const limited = limit > 0 ? selected.slice(0, limit) : selected;

  let scanned = 0;
  let ready = 0;
  let skippedMissing = 0;
  let created = 0;
  let updated = 0;
  let copied = 0;
  let reusedWithoutCopy = 0;
  let replacedBinary = 0;

  const skippedReasons = new Map<string, number>();

  for (const item of limited) {
    scanned += 1;

    const sourcePath = resolveSourcePath(item);
    if (!sourcePath) {
      skippedMissing += 1;
      skippedReasons.set("SOURCE_NOT_FOUND", (skippedReasons.get("SOURCE_NOT_FOUND") ?? 0) + 1);
      continue;
    }

    const categoryDirectory = FILE_CATEGORY_DIRECTORY[item.categoria_proyecto];
    if (!categoryDirectory) {
      skippedReasons.set("INVALID_CATEGORY", (skippedReasons.get("INVALID_CATEGORY") ?? 0) + 1);
      continue;
    }

    const year = detectYear(item);
    const folderParts = [storageRoot, categoryDirectory, year, `grado_${sanitizeSegment(item.grado_objetivo || "11")}`];

    if (item.area_proyecto) {
      folderParts.push(`area_${sanitizeSegment(item.area_proyecto)}`);
    }

    if (item.tipo_prueba_proyecto) {
      folderParts.push(`tipo_${sanitizeSegment(item.tipo_prueba_proyecto)}`);
    }

    const destinationFolder = path.resolve(path.join(...folderParts));
    const originalName = path.basename(sourcePath);
    const destinationName = buildInternalFileName(originalName);
    const destinationAbsolutePath = path.join(destinationFolder, destinationName);
    const sourceLogicalPath = `material/${item.source_relative_path.replace(/\\/g, "/")}`;
    const mimeType = detectMimeType(item.extension);
    const description = buildAssetDescription(item, sourceLogicalPath);

    ready += 1;

    if (!shouldApply) {
      continue;
    }

    const existing = await prisma.fileAsset.findFirst({
      where: {
        rutaLogica: sourceLogicalPath
      }
    });

    if (existing) {
      const existingMeta = parseDescriptionMetadata(existing.descripcion);
      const existingSha = existingMeta.sha256;
      const sameHash = existingSha?.toLowerCase() === item.sha256.toLowerCase();
      const existingAbsolutePath = path.resolve(storageRoot, existing.ruta);
      const existingFilePresent = fs.existsSync(existingAbsolutePath);

      let nextRuta = existing.ruta;
      let nextNombreArchivo = existing.nombreArchivo;

      if (!sameHash || !existingFilePresent) {
        ensureDirectory(destinationFolder);
        fs.copyFileSync(sourcePath, destinationAbsolutePath);
        copied += 1;
        replacedBinary += 1;

        nextRuta = toRelativeStoragePath(destinationAbsolutePath);
        nextNombreArchivo = destinationName;

        if (existingFilePresent && existingAbsolutePath !== destinationAbsolutePath) {
          try {
            fs.unlinkSync(existingAbsolutePath);
          } catch {
            // Sin impacto funcional si no se puede borrar el binario previo.
          }
        }
      } else {
        reusedWithoutCopy += 1;
      }

      await prisma.fileAsset.update({
        where: { id: existing.id },
        data: {
          nombreOriginal: originalName,
          nombreArchivo: nextNombreArchivo,
          categoria: item.categoria_proyecto,
          tipoMime: mimeType,
          extension: item.extension,
          pesoBytes: Number(item.size_bytes),
          ruta: nextRuta,
          rutaLogica: sourceLogicalPath,
          descripcion: description,
          gradoObjetivo: item.grado_objetivo || "11",
          area: item.area_proyecto,
          tipoPrueba: item.tipo_prueba_proyecto,
          activo: true,
          isCurrent: true,
          deletedAt: null
        }
      });
      updated += 1;
      continue;
    }

    ensureDirectory(destinationFolder);
    fs.copyFileSync(sourcePath, destinationAbsolutePath);
    copied += 1;
    const relativeStoragePath = toRelativeStoragePath(destinationAbsolutePath);

    await prisma.fileAsset.create({
      data: {
        nombreOriginal: originalName,
        nombreArchivo: destinationName,
        categoria: item.categoria_proyecto,
        tipoMime: mimeType,
        extension: item.extension,
        pesoBytes: Number(item.size_bytes),
        ruta: relativeStoragePath,
        rutaLogica: sourceLogicalPath,
        descripcion: description,
        gradoObjetivo: item.grado_objetivo || "11",
        area: item.area_proyecto,
        tipoPrueba: item.tipo_prueba_proyecto,
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
        mode: shouldApply ? "apply" : "dry-run",
        manifestPath,
        priorities: Array.from(priorities.values()),
        totalInManifest: manifest.files.length,
        selectedByPriority: selected.length,
        processed: scanned,
        ready,
        skippedMissing,
        copied,
        reusedWithoutCopy,
        replacedBinary,
        created,
        updated,
        skippedReasons: Object.fromEntries(skippedReasons.entries())
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
          message: error instanceof Error ? error.message : "Error en ingesta local de material"
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
