import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { spawnSync } from "child_process";

const argv = process.argv.slice(2);
const getArgValue = (name: string) => {
  const prefixed = argv.find((value) => value.startsWith(`--${name}=`));
  if (!prefixed) {
    return null;
  }
  const [, raw] = prefixed.split("=", 2);
  return raw?.trim() || null;
};

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
const dbPassword = process.env.BACKUP_DB_PASSWORD ?? parsedDbUrl?.password ?? process.env.POSTGRES_PASSWORD ?? "";
const sourceDbName = (process.env.BACKUP_DB_NAME ?? parsedDbUrl?.pathname.replace(/^\//, "") ?? process.env.POSTGRES_DB ?? "saber11db").trim();
const forceLocalMode = (process.env.BACKUP_USE_DOCKER ?? "").trim().toLowerCase() === "false";

const hasBinary = (command: string) => {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.status === 0;
};

const useDockerCompose = !forceLocalMode && hasBinary("docker");

const pickLatestBackup = () => {
  if (!fs.existsSync(backupDir)) {
    return null;
  }

  const backups = fs
    .readdirSync(backupDir)
    .filter((entry) => entry.toLowerCase().endsWith(".sql.gz"))
    .map((entry) => path.join(backupDir, entry))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return backups[0] ?? null;
};

const runCommand = (args: string[], options?: { input?: string }) => {
  const command = useDockerCompose ? "docker" : args[0];
  const effectiveArgs = useDockerCompose ? ["compose", "exec", "-T", dbService, ...args] : args.slice(1);

  const result = spawnSync(command, effectiveArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    input: options?.input,
    env: {
      ...process.env,
      PGPASSWORD: dbPassword
    }
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "").trim() || `Error ejecutando comando ${[command, ...effectiveArgs].join(" ")}`);
  }

  return result.stdout.trim();
};

const main = async () => {
  const fileArg = getArgValue("file");
  const backupFilePath = fileArg ? path.resolve(process.cwd(), fileArg) : pickLatestBackup();

  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    throw new Error("No se encontro backup para restore test. Usa --file=<ruta> o genera uno con npm run backup:db");
  }

  const compressed = fs.readFileSync(backupFilePath);
  const sqlContent = gunzipSync(compressed).toString("utf8");
  const tempDbName = `restore_test_${Date.now()}`;

  const startedAt = Date.now();
  let created = false;

  try {
    runCommand(useDockerCompose ? ["createdb", "-U", dbUser, tempDbName] : ["createdb", "-h", dbHost, "-p", dbPort, "-U", dbUser, tempDbName]);
    created = true;

    runCommand(
      useDockerCompose ? ["psql", "-U", dbUser, "-d", tempDbName] : ["psql", "-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", tempDbName],
      { input: sqlContent }
    );
    const tableCountRaw = runCommand(
      useDockerCompose
        ? ["psql", "-U", dbUser, "-d", tempDbName, "-tAc", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"]
        : [
            "psql",
            "-h",
            dbHost,
            "-p",
            dbPort,
            "-U",
            dbUser,
            "-d",
            tempDbName,
            "-tAc",
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
          ]
    );
    const tableCount = Number(tableCountRaw);

    if (!Number.isFinite(tableCount) || tableCount <= 0) {
      throw new Error("Restore test sin tablas en esquema public.");
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          backupFile: backupFilePath,
          sourceDbName,
          testDbName: tempDbName,
          useDockerCompose,
          restoredTables: tableCount,
          elapsedMs: Date.now() - startedAt
        },
        null,
        2
      )
    );
  } finally {
    if (created) {
      try {
        runCommand(
          useDockerCompose
            ? ["dropdb", "-U", dbUser, "--if-exists", tempDbName]
            : ["dropdb", "-h", dbHost, "-p", dbPort, "-U", dbUser, "--if-exists", tempDbName]
        );
      } catch {
        // No-op
      }
    }
  }
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : "Error en restore test"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
