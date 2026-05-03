import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { gzipSync } from "zlib";
import { spawnSync } from "child_process";

const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR ?? path.join("storage", "backups", "postgres"));
const dbService = (process.env.BACKUP_DB_SERVICE ?? "db").trim();
const parsedDbUrl = (() => {
  const value = process.env.DATABASE_URL ?? "";
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
})();

const dbHost = (process.env.BACKUP_DB_HOST ?? parsedDbUrl?.hostname ?? "db").trim();
const dbPort = (process.env.BACKUP_DB_PORT ?? parsedDbUrl?.port ?? "5432").trim();
const dbUser = (process.env.BACKUP_DB_USER ?? parsedDbUrl?.username ?? process.env.POSTGRES_USER ?? "saber11").trim();
const dbName = (process.env.BACKUP_DB_NAME ?? parsedDbUrl?.pathname.replace(/^\//, "") ?? process.env.POSTGRES_DB ?? "saber11db").trim();
const dbPassword = process.env.BACKUP_DB_PASSWORD ?? parsedDbUrl?.password ?? process.env.POSTGRES_PASSWORD ?? "";
const forceLocalMode = (process.env.BACKUP_USE_DOCKER ?? "").trim().toLowerCase() === "false";

const hasBinary = (command: string) => {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.status === 0;
};

const useDockerCompose = !forceLocalMode && hasBinary("docker");

const pad = (value: number) => String(value).padStart(2, "0");
const timestamp = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
};

const runDump = () => {
  const command = useDockerCompose ? "docker" : "pg_dump";
  const args = useDockerCompose
    ? ["compose", "exec", "-T", dbService, "pg_dump", "-U", dbUser, "-d", dbName, "--format=plain", "--no-owner", "--no-privileges"]
    : ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", dbName, "--format=plain", "--no-owner", "--no-privileges"];

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "buffer",
    maxBuffer: 512 * 1024 * 1024,
    env: {
      ...process.env,
      PGPASSWORD: dbPassword
    }
  });

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString("utf8").trim() : "";
    const stdout = result.stdout ? result.stdout.toString("utf8").trim() : "";
    throw new Error(stderr || stdout || `pg_dump finalizo con codigo ${result.status}`);
  }

  return result.stdout ?? Buffer.from([]);
};

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

const main = async () => {
  fs.mkdirSync(backupDir, { recursive: true });
  const startedAt = Date.now();
  const fileName = `backup_${dbName}_${timestamp()}.sql.gz`;
  const outputPath = path.join(backupDir, fileName);

  const sqlBuffer = runDump();
  const compressed = gzipSync(sqlBuffer, { level: 9 });
  fs.writeFileSync(outputPath, compressed);

  const checksum = sha256(compressed);
  const elapsedMs = Date.now() - startedAt;

  const manifestPath = outputPath.replace(/\.sql\.gz$/i, ".manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        dbService,
        useDockerCompose,
        dbHost,
        dbPort,
        dbUser,
        dbName,
        fileName,
        outputPath: path.relative(process.cwd(), outputPath).split(path.sep).join("/"),
        sizeBytes: compressed.byteLength,
        sha256: checksum,
        elapsedMs
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        backupFile: outputPath,
        manifestFile: manifestPath,
        sizeBytes: compressed.byteLength,
        sha256: checksum,
        elapsedMs
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : "Error creando backup"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
