import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const argv = process.argv.slice(2);

const hasFlag = (name: string) => argv.includes(`--${name}`);
const getArgValue = (name: string, fallback: string) => {
  const match = argv.find((value) => value.startsWith(`--${name}=`));
  if (!match) {
    return fallback;
  }
  const [, raw] = match.split("=", 2);
  return raw?.trim() ? raw.trim() : fallback;
};

const dryRun = hasFlag("dry-run");
const confirmed = hasFlag("confirm-reset");
const confirmedLocalProductionReset = hasFlag("confirm-local-production-reset");
const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
const databaseUrl = process.env.DATABASE_URL || "";
const localProductionPrepare = (process.env.LOCAL_PRODUCTION_PREPARE || "").trim().toLowerCase() === "true";
const allowNonLocalDb = getArgValue("allow-non-local", "false").toLowerCase() === "true";
const withSeed = getArgValue("with-seed", "true").toLowerCase() !== "false";
const withColombia = getArgValue("with-colombia", "true").toLowerCase() !== "false";
const departamento = getArgValue("departamento", "").trim();
const csvPath = getArgValue("csv", "").trim();
const backupFile = getArgValue("backup-file", "").trim();

if (!dryRun && !confirmed) {
  console.error("Debes confirmar la operacion con --confirm-reset");
  process.exit(1);
}

if (nodeEnv === "production") {
  if (!localProductionPrepare || !confirmedLocalProductionReset) {
    console.error(
      "Bloqueado en production: usa LOCAL_PRODUCTION_PREPARE=true y --confirm-local-production-reset para entorno LAN controlado."
    );
    process.exit(1);
  }
  if (!backupFile) {
    console.error("Bloqueado en production: debes indicar --backup-file=<ruta_backup.sql> antes de reset.");
    process.exit(1);
  }

  const backupAbsPath = path.resolve(process.cwd(), backupFile);
  if (!fs.existsSync(backupAbsPath)) {
    console.error(`Bloqueado en production: backup no encontrado en ${backupAbsPath}`);
    process.exit(1);
  }
}

if (!databaseUrl) {
  console.error("DATABASE_URL no configurada");
  process.exit(1);
}

const lowerDbUrl = databaseUrl.toLowerCase();
const looksLocal =
  lowerDbUrl.includes("localhost") ||
  lowerDbUrl.includes("127.0.0.1") ||
  lowerDbUrl.includes("@db:") ||
  lowerDbUrl.includes("@postgres:") ||
  lowerDbUrl.includes("saber11db");

if (!looksLocal && !allowNonLocalDb) {
  console.error("Bloqueado: DATABASE_URL no parece local. Usa --allow-non-local=true solo en staging controlado.");
  process.exit(1);
}

const plannedCommands: Array<{ label: string; command: string; args: string[] }> = [
  {
    label: "prisma migrate reset",
    command: "npx",
    args: ["prisma", "migrate", "reset", "--force", "--skip-seed"]
  }
];

if (withSeed) {
  plannedCommands.push({
    label: "seed base",
    command: "npm",
    args: ["run", "seed"]
  });
}

if (withColombia) {
  const args = ["ts-node", "scripts/import_colombia_schools.ts", "--apply"];
  if (nodeEnv === "production") {
    args.push("--confirm-local-production");
  }
  if (departamento) {
    args.push(`--departamento=${departamento}`);
  }
  if (csvPath) {
    args.push("--source=csv", `--csv=${csvPath}`);
  }
  plannedCommands.push({
    label: "import colegios colombia",
    command: "npx",
    args
  });
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        success: true,
        mode: "dry-run",
        nodeEnv,
        withSeed,
        withColombia,
        plannedCommands
      },
      null,
      2
    )
  );
  process.exit(0);
}

const run = (label: string, command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    throw new Error(`Fallo ${label}`);
  }
};

try {
  for (const step of plannedCommands) {
    run(step.label, step.command, step.args);
  }
  console.log(
    JSON.stringify(
      {
        success: true,
        mode: "apply",
        nodeEnv,
        withSeed,
        withColombia
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        success: false,
        mode: "apply",
        message: error instanceof Error ? error.message : "Fallo en db:reset:clean"
      },
      null,
      2
    )
  );
  process.exit(1);
}
