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
const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
const withAi = getArgValue("with-ai", "false").toLowerCase() === "true";
const aiCount = Number(getArgValue("ai-count", "6"));
const departamento = getArgValue("departamento", "").trim();
const csvPath = getArgValue("csv", "").trim();

if (!dryRun && !confirmed) {
  console.error("Debes confirmar con --confirm-reset para ejecutar db:prepare:demo");
  process.exit(1);
}

if (nodeEnv === "production") {
  console.error("Bloqueado: db:prepare:demo no se permite en NODE_ENV=production");
  process.exit(1);
}

const resetArgs = ["ts-node", "scripts/db_reset_clean.ts"];
if (dryRun) {
  resetArgs.push("--dry-run");
} else {
  resetArgs.push("--confirm-reset");
}
if (departamento) {
  resetArgs.push(`--departamento=${departamento}`);
}
if (csvPath) {
  resetArgs.push(`--csv=${csvPath}`);
}

const plannedCommands: Array<{ label: string; command: string; args: string[] }> = [
  { label: "reset clean + seed + colegios", command: "npx", args: resetArgs },
  { label: "prisma generate", command: "npx", args: ["prisma", "generate"] }
];

if (withAi) {
  plannedCommands.push({
    label: "generar preguntas IA demo",
    command: "npx",
    args: [
      "ts-node",
      "scripts/generate_simulator_questions_ai.ts",
      "--apply",
      "--publish=false",
      `--count=${Number.isFinite(aiCount) && aiCount > 0 ? aiCount : 6}`
    ]
  });
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        success: true,
        mode: "dry-run",
        withAi,
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
        withAi
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
        message: error instanceof Error ? error.message : "Fallo en db:prepare:demo"
      },
      null,
      2
    )
  );
  process.exit(1);
}
