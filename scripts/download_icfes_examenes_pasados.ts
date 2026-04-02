import crypto from "crypto";
import fs from "fs";
import path from "path";

type DownloadTarget = {
  year: string;
  kind: string;
  area: string;
  url: string;
};

type ManifestRow = {
  year: string;
  kind: string;
  area: string;
  source_url: string;
  local_path: string;
  file_name: string;
  size_bytes: number;
  sha256: string;
  downloaded_now: boolean;
  collected_at: string;
};

const defaultTargets: DownloadTarget[] = [
  {
    year: "2017",
    kind: "guia_orientacion",
    area: "general",
    url: "https://www.icfes.gov.co/wp-content/uploads/2024/11/Guia-de-orientacion-saber-11-2017-1.pdf"
  },
  {
    year: "2017",
    kind: "guia_orientacion",
    area: "general",
    url: "https://www.icfes.gov.co/wp-content/uploads/2024/11/Guia-de-orientacion-saber-11-2017-2.pdf"
  },
  {
    year: "2021",
    kind: "guia_orientacion",
    area: "general",
    url: "https://www.icfes.gov.co/wp-content/uploads/2024/11/Guia-de-orientacion-Saber-11.%C2%B0-2021-1-Pdf-accesible.pdf"
  },
  {
    year: "2024",
    kind: "cuadernillo",
    area: "ingles",
    url: "https://www.icfes.gov.co/wp-content/uploads/2025/12/16-octubre-cuadernillo-ingles-saber-11-2024.pdf"
  },
  {
    year: "2025",
    kind: "guia_orientacion",
    area: "general",
    url: "https://www.icfes.gov.co/wp-content/uploads/2025/02/07-Noviembre-Guia-de-Orientacion-Saber-11-2025-1.pdf"
  },
  {
    year: "2025",
    kind: "cuadernillo",
    area: "ciencias_naturales",
    url: "https://www.icfes.gov.co/wp-content/uploads/2025/12/22-diciembre-cuadernillo-de-preguntas-ciencias-naturales-saber-11-2025.pdf"
  },
  {
    year: "2026",
    kind: "guia_orientacion",
    area: "general",
    url: "https://www.icfes.gov.co/wp-content/uploads/2025/12/02-diciembre-guia-de-orientacion-saber-11-2026.pdf"
  },
  {
    year: "2026",
    kind: "cuadernillo",
    area: "lectura_critica",
    url: "https://www.icfes.gov.co/wp-content/uploads/2026/03/16-feb-cuadernillo-de-preguntas-lectura-critica-saber-11-2026.pdf"
  },
  {
    year: "2026",
    kind: "cuadernillo",
    area: "ciencias_naturales",
    url: "https://www.icfes.gov.co/wp-content/uploads/2026/03/24-feb-cuadernillo-preguntas-ciencias-naturales-saber-11-2026.pdf"
  },
  {
    year: "2026",
    kind: "guia_orientacion",
    area: "general",
    url: "https://www.icfes.gov.co/wp-content/uploads/2026/03/17-marzo-guia-de-orientacion-saber-11-2026-2.pdf"
  }
];

const manifestSeedPath = path.resolve(
  process.cwd(),
  "storage",
  "bancos_preguntas",
  "icfes",
  "examenes_pasados",
  "manifest_examenes_saber11_2021_2025_consolidado.json"
);

const root = path.resolve(
  process.cwd(),
  "storage",
  "bancos_preguntas",
  "icfes",
  "examenes_pasados"
);

const ensureDirectory = (directoryPath: string) => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

const resolveTargets = (): DownloadTarget[] => {
  if (!fs.existsSync(manifestSeedPath)) {
    return defaultTargets;
  }

  try {
    const raw = fs.readFileSync(manifestSeedPath, "utf-8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return defaultTargets;
    }

    const normalized = parsed
      .map((item) => ({
        year: String(item.year ?? "").trim(),
        kind: String(item.type ?? item.kind ?? "").trim() || "material",
        area: String(item.area ?? "").trim() || "general",
        url: String(item.source_url ?? item.url ?? "").trim()
      }))
      .filter((item) => item.year && item.url);

    const uniqueByUrl = new Map<string, DownloadTarget>();
    for (const item of normalized) {
      uniqueByUrl.set(item.url, item);
    }

    return uniqueByUrl.size ? Array.from(uniqueByUrl.values()) : defaultTargets;
  } catch {
    return defaultTargets;
  }
};

const fileNameFromUrl = (url: string) => {
  const pathname = new URL(url).pathname;
  const raw = path.basename(pathname) || "archivo.pdf";
  const decoded = decodeURIComponent(raw);

  if (decoded === "Guia-de-orientacion-Saber-11.°-2021-1-Pdf-accesible.pdf") {
    return "Guia-de-orientacion-Saber-11-2021-1-Pdf-accesible.pdf";
  }

  return decoded;
};

const sha256FromFile = (absolutePath: string) => {
  const hash = crypto.createHash("sha256");
  const content = fs.readFileSync(absolutePath);
  hash.update(content);
  return hash.digest("hex");
};

const downloadToFile = async (url: string, destinationPath: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Descarga fallida (${response.status}) para ${url}`);
  }

  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("pdf")) {
    throw new Error(`El recurso no parece PDF (${contentType || "sin content-type"}): ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(destinationPath, buffer);
};

const buildManifest = async () => {
  ensureDirectory(root);
  const targets = resolveTargets();

  const rows: ManifestRow[] = [];

  for (const target of targets) {
    const yearFolder = path.join(root, target.year);
    ensureDirectory(yearFolder);

    const fileName = fileNameFromUrl(target.url);
    const destinationPath = path.join(yearFolder, fileName);
    let downloadedNow = false;

    if (!fs.existsSync(destinationPath)) {
      await downloadToFile(target.url, destinationPath);
      downloadedNow = true;
    }

    const stats = fs.statSync(destinationPath);
    const sha256 = sha256FromFile(destinationPath);

    rows.push({
      year: target.year,
      kind: target.kind,
      area: target.area,
      source_url: target.url,
      local_path: destinationPath,
      file_name: fileName,
      size_bytes: Number(stats.size),
      sha256,
      downloaded_now: downloadedNow,
      collected_at: new Date().toISOString()
    });
  }

  const manifestPath = path.join(root, "manifest_examenes_pasados.json");
  const sorted = [...rows].sort((left, right) => {
    const keyLeft = `${left.year}_${left.kind}_${left.area}_${left.file_name}`;
    const keyRight = `${right.year}_${right.kind}_${right.area}_${right.file_name}`;
    return keyLeft.localeCompare(keyRight);
  });

  fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 2), "utf-8");

  console.log(
    JSON.stringify(
      {
        success: true,
        totalFiles: sorted.length,
        manifestPath
      },
      null,
      2
    )
  );
};

buildManifest().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : "No se pudo descargar examenes pasados"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
