import { spawnSync } from "child_process";

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

const requiredConfirm = hasFlag("confirm");
if (!requiredConfirm) {
  console.error("Debes confirmar la operacion con --confirm");
  process.exit(1);
}

const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
if (nodeEnv === "production") {
  console.error("Bloqueado: db:reset:dev no se permite en NODE_ENV=production");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL no configurada");
  process.exit(1);
}

const lowerDbUrl = databaseUrl.toLowerCase();
const isLocalDb =
  lowerDbUrl.includes("localhost") ||
  lowerDbUrl.includes("127.0.0.1") ||
  lowerDbUrl.includes("@db:") ||
  lowerDbUrl.includes("@postgres:") ||
  lowerDbUrl.includes("saber11db");

if (!isLocalDb) {
  console.error("Bloqueado: DATABASE_URL no parece entorno local/desarrollo seguro");
  process.exit(1);
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

const withSeed = getArgValue("with-seed", "true").toLowerCase() !== "false";
const withMagdalena = getArgValue("with-magdalena", "false").toLowerCase() === "true";
const csvPath = getArgValue("csv", "").trim();

try {
  run("prisma migrate reset", "npx", ["prisma", "migrate", "reset", "--force", "--skip-seed"]);

  if (withSeed) {
    run("npm run seed", "npm", ["run", "seed"]);
  }

  if (withMagdalena) {
    const args = ["ts-node", "scripts/import_magdalena_schools.ts", "--apply"];
    if (csvPath) {
      args.push(`--csv=${csvPath}`);
      args.push("--source=csv");
    }
    run("seed colegios magdalena", "npx", args);
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        withSeed,
        withMagdalena,
        csvPath: csvPath || null
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
        message: error instanceof Error ? error.message : "Fallo en db:reset:dev"
      },
      null,
      2
    )
  );
  process.exit(1);
}
