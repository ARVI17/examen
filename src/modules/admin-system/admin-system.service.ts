import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/AppError";
import prisma from "../../common/prisma";
import { getLanUrls } from "../../common/utils/network";
import { createAuditLog } from "../../common/utils/audit";
import { config } from "../../config";

type ActorUser = Express.Request["user"];

type DryRunInput = {
  datasetId?: string;
  departamento?: string;
  municipio?: string;
  search?: string;
  limit?: number;
};

type ApplyInput = {
  confirmText: string;
  acceptedRisk: boolean;
  datasetId?: string;
  filters?: {
    departamento?: string;
    municipio?: string;
    search?: string;
  };
};

type BackupInput = {
  assistantOnly?: boolean;
};

type LocalPrepareInput = {
  confirmText: string;
  acceptedDataLossRisk: boolean;
  execute?: boolean;
  withSchools?: boolean;
  withDemoUsers?: boolean;
  withAi?: boolean;
  aiCount?: number;
  departamento?: string;
  backupFile?: string;
};

type ChecklistUpdateInput = {
  checked: boolean;
  note?: string;
};

type JsonRecord = Record<string, unknown>;

const ADMIN_SYSTEM_ENTITY = "admin_system";
const REQUIRED_IMPORT_CONFIRM = "IMPORTAR COLEGIOS COLOMBIA";
const REQUIRED_PREPARE_CONFIRM = "PREPARAR PRODUCCION LOCAL";
const DRY_RUN_VALIDITY_MS = 2 * 60 * 60 * 1000;
const BACKUP_VALIDITY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_SCHOOL_DATASETS = new Set(["cfw5-qzt5", "c56g-ubd2", "28t6-6wvz", "ntg6-c8mx", "annq-98tm", "upkm-vdjb", "5wb3-gjax"]);

const operationLock: {
  running: boolean;
  action: string | null;
  startedAt: string | null;
} = {
  running: false,
  action: null,
  startedAt: null
};

const checklistTemplate = [
  { id: "lan.admin.from_other_pc", area: "LAN", label: "Otro PC abre /admin por IP LAN" },
  { id: "lan.simulator.from_other_pc", area: "LAN", label: "Otro PC abre /simulador por IP LAN" },
  { id: "lan.health.by_ip", area: "LAN", label: "Health por IP LAN responde 200" },
  { id: "simulacro.server.power", area: "SIMULACRO LAN", label: "Servidor conectado a corriente y sin suspension" },
  { id: "simulacro.docker.active", area: "SIMULACRO LAN", label: "Docker activo antes de iniciar la jornada" },
  { id: "simulacro.health.ok", area: "SIMULACRO LAN", label: "Health y Ready en estado OK" },
  { id: "simulacro.ip.confirmed", area: "SIMULACRO LAN", label: "IP LAN confirmada con el equipo aplicador" },
  { id: "simulacro.firewall.confirmed", area: "SIMULACRO LAN", label: "Firewall privado habilita puerto 4000" },
  { id: "simulacro.simulator.other_pc", area: "SIMULACRO LAN", label: "Otro PC abre /simulador correctamente" },
  { id: "simulacro.simulator.mobile", area: "SIMULACRO LAN", label: "Celular abre /simulador en la misma red" },
  { id: "simulacro.step5.ok", area: "SIMULACRO LAN", label: "Prueba escalonada de 5 estudiantes completada" },
  { id: "simulacro.role.admin", area: "SIMULACRO LAN", label: "Flujo ADMIN validado en jornada actual" },
  { id: "simulacro.role.teacher", area: "SIMULACRO LAN", label: "Flujo DOCENTE validado en jornada actual" },
  { id: "simulacro.role.student", area: "SIMULACRO LAN", label: "Flujo ESTUDIANTE validado en jornada actual" },
  { id: "simulacro.no_heavy_ops", area: "SIMULACRO LAN", label: "No ejecutar import, backup ni IA durante simulacro" },
  { id: "simulacro.logs.reviewed", area: "SIMULACRO LAN", label: "Logs revisados al cierre sin errores criticos" },
  { id: "admin.login", area: "ADMIN", label: "Login ADMIN correcto" },
  { id: "admin.dashboard", area: "ADMIN", label: "Dashboard y KPIs cargan" },
  { id: "admin.schools.filter", area: "ADMIN", label: "Filtro Departamento > Municipio > Colegio funciona" },
  { id: "admin.schools.search.palominito", area: "ADMIN", label: "Busqueda PALOMINITO funciona" },
  { id: "admin.ai.review", area: "ADMIN", label: "Revision IA disponible para ADMIN" },
  { id: "teacher.scope", area: "DOCENTE", label: "Docente solo ve su alcance" },
  { id: "teacher.system.blocked", area: "DOCENTE", label: "Docente bloqueado en Operacion del sistema" },
  { id: "student.login", area: "ESTUDIANTE", label: "Login estudiante correcto" },
  { id: "student.attempt.flow", area: "ESTUDIANTE", label: "Estudiante inicia/responde/finaliza intento" },
  { id: "student.own_results", area: "ESTUDIANTE", label: "Estudiante ve solo su resultado propio" },
  { id: "security.anonymous.blocked", area: "SEGURIDAD", label: "Anonimo bloqueado en rutas admin system" },
  { id: "security.no_cors_error", area: "SEGURIDAD", label: "Sin errores CORS en flujo LAN" },
  { id: "responsive.admin.mobile", area: "RESPONSIVE", label: "Admin usable en movil/tablet" },
  { id: "responsive.simulator.mobile", area: "RESPONSIVE", label: "Simulador usable en movil" }
] as const;

const nowIso = () => new Date().toISOString();

const parseBool = (value: string | undefined) => (value || "").trim().toLowerCase() === "true";

const isPrivateIp = (candidate: string) => {
  if (/^10\./.test(candidate)) return true;
  if (/^192\.168\./.test(candidate)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(candidate)) return true;
  return false;
};

const extractHostIp = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `http://${normalized}`;
  try {
    const url = new URL(withProtocol);
    return isPrivateIp(url.hostname) ? url.hostname : "";
  } catch {
    return "";
  }
};

const detectLanIp = () => {
  const fromPublicBase = extractHostIp(config.publicBaseUrl);
  if (fromPublicBase) {
    return fromPublicBase;
  }
  const fromPublicHost = extractHostIp(config.publicHostname);
  if (fromPublicHost) {
    return fromPublicHost;
  }

  const entries = Object.entries(os.networkInterfaces());
  for (const [name, addresses] of entries) {
    if (!addresses || /docker|veth|wsl|hyper-v|loopback/i.test(name)) {
      continue;
    }
    for (const item of addresses) {
      if (item.family !== "IPv4" || item.internal) {
        continue;
      }
      if (isPrivateIp(item.address)) {
        return item.address;
      }
    }
  }

  const lanUrls = getLanUrls(config.port);
  for (const url of lanUrls) {
    const parsed = extractHostIp(url);
    if (parsed) {
      return parsed;
    }
  }

  return "";
};

const toSafeOperationDetails = (details: unknown) => {
  if (!details || typeof details !== "object") {
    return {};
  }
  const object = details as JsonRecord;
  return {
    success: Boolean(object.success),
    mode: typeof object.mode === "string" ? object.mode : undefined,
    source: typeof object.source === "string" ? object.source : undefined,
    totalRead: typeof object.totalRead === "number" ? object.totalRead : undefined,
    normalized: typeof object.normalized === "number" ? object.normalized : undefined,
    inserted: typeof object.inserted === "number" ? object.inserted : undefined,
    updated: typeof object.updated === "number" ? object.updated : undefined,
    duplicatesInInput: typeof object.duplicatesInInput === "number" ? object.duplicatesInInput : undefined,
    errors: typeof object.errors === "number" ? object.errors : undefined,
    oficiales: typeof object.oficiales === "number" ? object.oficiales : undefined,
    noOficiales: typeof object.noOficiales === "number" ? object.noOficiales : undefined,
    departamentos: typeof object.departamentos === "number" ? object.departamentos : undefined,
    municipios: typeof object.municipios === "number" ? object.municipios : undefined,
    durationMs: typeof object.durationMs === "number" ? object.durationMs : undefined
  };
};

const sanitizeScriptText = (value: string) => value.replace(/\s+/g, " ").trim();

const parseJsonFromScriptOutput = (output: string): JsonRecord | null => {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as JsonRecord;
  } catch {
    // continue
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as JsonRecord;
    } catch {
      // continue
    }
  }

  const lines = trimmed.split(/\r?\n/).reverse();
  for (const line of lines) {
    const safe = line.trim();
    if (!safe.startsWith("{") || !safe.endsWith("}")) {
      continue;
    }
    try {
      return JSON.parse(safe) as JsonRecord;
    } catch {
      // continue
    }
  }

  return null;
};

const runScript = (scriptPath: string, args: string[], envOverrides?: Record<string, string>) => {
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
  if (!fs.existsSync(absoluteScriptPath)) {
    throw new AppError(`Script no encontrado: ${scriptPath}`, 500, "SCRIPT_NOT_FOUND");
  }

  const result = spawnSync("npx", ["ts-node", scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...(envOverrides || {})
    }
  });

  const stdout = sanitizeScriptText(result.stdout || "");
  const stderr = sanitizeScriptText(result.stderr || "");
  const parsedJson = parseJsonFromScriptOutput(`${result.stdout || ""}\n${result.stderr || ""}`);

  if (result.status !== 0) {
    const parsedMessage = typeof parsedJson?.message === "string" ? parsedJson.message : null;
    const message = parsedMessage || stderr || stdout || `Fallo ejecutando script ${scriptPath}`;
    throw new AppError(message, 400, "ADMIN_SYSTEM_SCRIPT_FAILED");
  }

  return {
    parsedJson,
    stdout,
    stderr
  };
};

const findLatestBackupManifest = () => {
  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR ?? path.join("storage", "backups", "postgres"));
  if (!fs.existsSync(backupDir)) {
    return null;
  }
  const manifests = fs
    .readdirSync(backupDir)
    .filter((entry) => entry.toLowerCase().endsWith(".manifest.json"))
    .map((entry) => path.join(backupDir, entry))
    .sort((a, b) => {
      const aTime = fs.statSync(a).mtimeMs;
      const bTime = fs.statSync(b).mtimeMs;
      return bTime - aTime;
    });

  const latest = manifests[0];
  if (!latest) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(latest, "utf8")) as JsonRecord;
    const backupFile = typeof parsed.backupFile === "string" ? parsed.backupFile : null;
    const fullBackupPath = backupFile
      ? path.resolve(process.cwd(), backupFile)
      : latest.replace(/\.manifest\.json$/i, ".sql.gz");

    const stats = fs.existsSync(fullBackupPath) ? fs.statSync(fullBackupPath) : fs.statSync(latest);
    return {
      manifestPath: path.relative(process.cwd(), latest).split(path.sep).join("/"),
      backupPath: path.relative(process.cwd(), fullBackupPath).split(path.sep).join("/"),
      backupAbsolutePath: fullBackupPath,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : fs.statSync(latest).mtime.toISOString(),
      sizeBytes: Number(parsed.sizeBytes ?? stats.size) || stats.size,
      ageMs: Date.now() - new Date(typeof parsed.createdAt === "string" ? parsed.createdAt : fs.statSync(latest).mtime.toISOString()).getTime()
    };
  } catch {
    const stats = fs.statSync(latest);
    return {
      manifestPath: path.relative(process.cwd(), latest).split(path.sep).join("/"),
      backupPath: latest.replace(/\.manifest\.json$/i, ".sql.gz"),
      backupAbsolutePath: latest.replace(/\.manifest\.json$/i, ".sql.gz"),
      createdAt: stats.mtime.toISOString(),
      sizeBytes: stats.size,
      ageMs: Date.now() - stats.mtimeMs
    };
  }
};

const assertNoRunningOperation = () => {
  if (operationLock.running) {
    throw new AppError("Hay una operacion administrativa en curso. Espera a que finalice.", 409, "ADMIN_SYSTEM_OPERATION_RUNNING");
  }
};

const withOperationLock = async <T>(action: string, executor: () => Promise<T>): Promise<T> => {
  assertNoRunningOperation();
  operationLock.running = true;
  operationLock.action = action;
  operationLock.startedAt = nowIso();

  try {
    return await executor();
  } finally {
    operationLock.running = false;
    operationLock.action = null;
    operationLock.startedAt = null;
  }
};

const logAdminSystem = async (action: string, userId: string, payload: JsonRecord) => {
  await createAuditLog({
    entidad: ADMIN_SYSTEM_ENTITY,
    entidadId: action,
    accion: action,
    userId,
    datos: payload as Prisma.InputJsonValue
  });
};

const assertAdminActor = (actor?: ActorUser): NonNullable<ActorUser> => {
  if (!actor?.id) {
    throw new AppError("Usuario no autenticado", 401, "UNAUTHORIZED");
  }
  if (actor.role !== "ADMIN") {
    throw new AppError("No autorizado para esta accion", 403, "FORBIDDEN");
  }
  return actor;
};

const buildFilterArgs = (filters: { departamento?: string; municipio?: string; search?: string; limit?: number }) => {
  const args: string[] = [];
  if (filters.departamento) args.push(`--departamento=${filters.departamento}`);
  if (filters.municipio) args.push(`--municipio=${filters.municipio}`);
  if (filters.search) args.push(`--search=${filters.search}`);
  if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) args.push(`--limit=${Math.max(1, Math.min(10000, filters.limit))}`);
  return args;
};

const assertLocalProductionPrepareEnabled = () => {
  if (!parseBool(process.env.LOCAL_PRODUCTION_PREPARE)) {
    throw new AppError(
      "LOCAL_PRODUCTION_PREPARE=true es obligatorio para esta accion en produccion local.",
      409,
      "LOCAL_PRODUCTION_PREPARE_REQUIRED"
    );
  }
};

const assertAllowedDataset = (datasetId: string) => {
  const normalized = datasetId.trim().toLowerCase();
  if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(normalized)) {
    throw new AppError("datasetId invalido", 400, "INVALID_DATASET_ID");
  }
  if (!ALLOWED_SCHOOL_DATASETS.has(normalized)) {
    throw new AppError(
      `datasetId no permitido. Usa uno de: ${Array.from(ALLOWED_SCHOOL_DATASETS).join(", ")}`,
      400,
      "DATASET_NOT_ALLOWED"
    );
  }
  return normalized;
};

const getLastSuccessfulAudit = async (action: string) => {
  const entry = await prisma.auditLog.findFirst({
    where: {
      entidad: ADMIN_SYSTEM_ENTITY,
      accion: action
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!entry) {
    return null;
  }

  const payload = (entry.datos as JsonRecord) || {};
  if (!payload.success) {
    return null;
  }

  return {
    entry,
    payload
  };
};

const sanitizeChecklistItem = (itemId: string) => {
  const exists = checklistTemplate.some((item) => item.id === itemId);
  if (!exists) {
    throw new AppError("Item de checklist no reconocido", 404, "CHECKLIST_ITEM_NOT_FOUND");
  }
  return itemId;
};

const getChecklistStateFromLogs = async () => {
  const records = await prisma.auditLog.findMany({
    where: {
      entidad: ADMIN_SYSTEM_ENTITY,
      accion: "CHECKLIST_UPDATE"
    },
    orderBy: {
      createdAt: "asc"
    },
    take: 800
  });

  const stateMap = new Map<string, { checked: boolean; note: string | null; updatedAt: string }>();
  for (const entry of records) {
    const payload = (entry.datos as JsonRecord) || {};
    const itemId = typeof payload.itemId === "string" ? payload.itemId : "";
    if (!itemId || !checklistTemplate.some((item) => item.id === itemId)) {
      continue;
    }
    stateMap.set(itemId, {
      checked: Boolean(payload.checked),
      note: typeof payload.note === "string" ? payload.note : null,
      updatedAt: entry.createdAt.toISOString()
    });
  }

  return checklistTemplate.map((item) => {
    const tracked = stateMap.get(item.id);
    return {
      ...item,
      checked: tracked?.checked ?? false,
      note: tracked?.note ?? null,
      updatedAt: tracked?.updatedAt ?? null
    };
  });
};

export class AdminSystemService {
  static async status(actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    const started = Date.now();
    const lanIp = detectLanIp();
    const localBase = `http://localhost:${config.port}`;
    const baseUrl = config.publicBaseUrl || localBase;

    let databaseReady = false;
    let dbResponseMs: number | null = null;
    try {
      const dbStarted = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      databaseReady = true;
      dbResponseMs = Date.now() - dbStarted;
    } catch {
      databaseReady = false;
    }

    const ollamaHost = (process.env.OLLAMA_HOST || "").trim();
    let ollamaAvailable = false;
    if (ollamaHost) {
      try {
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 2000);
        const response = await fetch(`${ollamaHost.replace(/\/+$/, "")}/api/tags`, {
          signal: abort.signal,
          headers: { Accept: "application/json" }
        });
        clearTimeout(timeout);
        ollamaAvailable = response.ok;
      } catch {
        ollamaAvailable = false;
      }
    }

    const warnings: string[] = [];
    if (!databaseReady) warnings.push("Base de datos no disponible.");
    if (ollamaHost && !ollamaAvailable) warnings.push("Ollama no responde.");
    if (!parseBool(process.env.LOCAL_PRODUCTION_PREPARE)) {
      warnings.push("LOCAL_PRODUCTION_PREPARE=false: operaciones sensibles bloqueadas por seguridad.");
    }

    const payload = {
      ok: databaseReady,
      currentTime: nowIso(),
      nodeEnv: config.nodeEnv,
      uptimeSeconds: Math.floor(process.uptime()),
      host: config.host,
      port: config.port,
      publicBaseUrl: config.publicBaseUrl || null,
      lanIp: lanIp || null,
      adminUrl: `${baseUrl.replace(/\/+$/, "")}/admin/`,
      simulatorUrl: `${baseUrl.replace(/\/+$/, "")}/simulador/`,
      healthUrl: `${baseUrl.replace(/\/+$/, "")}/health`,
      readyUrl: `${baseUrl.replace(/\/+$/, "")}/health/ready`,
      services: {
        api: "up",
        db: databaseReady ? "up" : "down",
        ollama: ollamaHost ? (ollamaAvailable ? "up" : "down") : "not-configured"
      },
      databaseReady,
      dbResponseMs,
      ollamaAvailable,
      appVersion: process.env.npm_package_version ?? null,
      operationLock: {
        running: operationLock.running,
        action: operationLock.action,
        startedAt: operationLock.startedAt
      },
      warnings,
      checkDurationMs: Date.now() - started
    };

    await logAdminSystem("SYSTEM_STATUS_VIEW", admin.id, {
      success: true,
      databaseReady,
      ollamaAvailable,
      warnings
    });

    return payload;
  }

  static async lan(actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    const lanIp = detectLanIp();
    const localBase = `http://localhost:${config.port}`;
    const baseUrl = config.publicBaseUrl || (lanIp ? `http://${lanIp}:${config.port}` : localBase);

    const payload = {
      lanIp: lanIp || null,
      publicBaseUrl: config.publicBaseUrl || null,
      adminUrl: `${baseUrl.replace(/\/+$/, "")}/admin/`,
      simulatorUrl: `${baseUrl.replace(/\/+$/, "")}/simulador/`,
      healthUrl: `${baseUrl.replace(/\/+$/, "")}/health`,
      readyUrl: `${baseUrl.replace(/\/+$/, "")}/health/ready`,
      instructions: [
        "Conecta los equipos a la misma red local (LAN/WiFi).",
        "Usa la IP LAN del servidor, no 127.0.0.1.",
        "Habilita puerto 4000/TCP en firewall para perfil Private.",
        "No expongas este servicio a internet."
      ],
      checklist: {
        sameNetworkRequired: true,
        firewallPort4000Private: true,
        avoidLocalhostFromClients: true,
        avoidInternetExposure: true
      },
      detectedLanUrls: getLanUrls(config.port)
    };

    await logAdminSystem("SYSTEM_LAN_VIEW", admin.id, {
      success: true,
      lanIp: payload.lanIp
    });

    return payload;
  }

  static async health(actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    const started = Date.now();
    const checks = {
      api: { status: "OK", durationMs: 0 },
      database: { status: "ERROR", durationMs: 0 },
      ollama: { status: "WARN", durationMs: 0 }
    };

    let databaseReady = false;
    try {
      const dbStarted = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database.status = "OK";
      checks.database.durationMs = Date.now() - dbStarted;
      databaseReady = true;
    } catch {
      checks.database.status = "ERROR";
    }

    const ollamaHost = (process.env.OLLAMA_HOST || "").trim();
    if (!ollamaHost) {
      checks.ollama.status = "WARN";
    } else {
      try {
        const ollamaStarted = Date.now();
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 2000);
        const response = await fetch(`${ollamaHost.replace(/\/+$/, "")}/api/tags`, {
          signal: abort.signal,
          headers: { Accept: "application/json" }
        });
        clearTimeout(timeout);
        checks.ollama.status = response.ok ? "OK" : "ERROR";
        checks.ollama.durationMs = Date.now() - ollamaStarted;
      } catch {
        checks.ollama.status = "ERROR";
      }
    }

    const status = checks.database.status === "ERROR" ? "ERROR" : checks.ollama.status === "ERROR" ? "WARN" : "OK";
    const payload = {
      status,
      timestamp: nowIso(),
      durationMs: Date.now() - started,
      checks: {
        api: checks.api,
        database: checks.database,
        ollama: checks.ollama
      },
      messages: [
        checks.database.status === "OK" ? "Base de datos lista." : "Base de datos no disponible.",
        checks.ollama.status === "OK"
          ? "Ollama disponible."
          : checks.ollama.status === "WARN"
            ? "Ollama no configurado en este entorno."
            : "Ollama no responde."
      ]
    };

    await logAdminSystem("HEALTH_CHECK", admin.id, {
      success: databaseReady,
      status,
      database: checks.database.status,
      ollama: checks.ollama.status
    });

    return payload;
  }

  static async schoolsImportDryRun(input: DryRunInput, actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    const datasetId = assertAllowedDataset(input.datasetId || "cfw5-qzt5");
    const filters = {
      departamento: input.departamento,
      municipio: input.municipio,
      search: input.search,
      limit: input.limit && Number.isFinite(input.limit) ? Math.max(1, Math.min(10000, input.limit)) : 5000
    };
    const args = [`--dataset-id=${datasetId}`, ...buildFilterArgs(filters)];

    const executed = runScript("scripts/import_colombia_schools.ts", args);
    const report = executed.parsedJson || {};
    const success = Boolean(report.success);

    await logAdminSystem("SCHOOLS_IMPORT_DRY_RUN", admin.id, {
      success,
      datasetId,
      filters,
      report: toSafeOperationDetails(report)
    });

    return {
      success,
      datasetId,
      filters,
      summary: report,
      prerequisites: await this.getApplyPrerequisites()
    };
  }

  static async schoolsImportApply(input: ApplyInput, actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    if (input.confirmText !== REQUIRED_IMPORT_CONFIRM) {
      throw new AppError(`Confirmacion invalida. Escribe exactamente: ${REQUIRED_IMPORT_CONFIRM}`, 400, "CONFIRMATION_MISMATCH");
    }
    if (!input.acceptedRisk) {
      throw new AppError("Debes aceptar el riesgo de importacion para continuar.", 400, "RISK_NOT_ACCEPTED");
    }
    assertLocalProductionPrepareEnabled();
    const prerequisites = await this.getApplyPrerequisites();
    if (!prerequisites.hasRecentDryRun) {
      throw new AppError("Debes ejecutar dry-run exitoso antes de importar.", 409, "DRY_RUN_REQUIRED");
    }
    if (!prerequisites.hasRecentBackup) {
      throw new AppError("Debes crear backup reciente antes de importar.", 409, "BACKUP_REQUIRED");
    }

    const datasetId = assertAllowedDataset(input.datasetId || "cfw5-qzt5");
    const filters = {
      departamento: input.filters?.departamento,
      municipio: input.filters?.municipio,
      search: input.filters?.search
    };
    const args = ["--apply", "--confirm-local-production", `--dataset-id=${datasetId}`, ...buildFilterArgs(filters)];

    return withOperationLock("SCHOOLS_IMPORT_APPLY", async () => {
      const executed = runScript("scripts/import_colombia_schools.ts", args, {
        LOCAL_PRODUCTION_PREPARE: "true"
      });
      const report = executed.parsedJson || {};
      const success = Boolean(report.success);

      await logAdminSystem("SCHOOLS_IMPORT_APPLY", admin.id, {
        success,
        datasetId,
        filters,
        report: toSafeOperationDetails(report)
      });

      return {
        success,
        datasetId,
        filters,
        summary: report
      };
    });
  }

  static async createBackup(input: BackupInput, actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    if (input.assistantOnly) {
      const suggestedCommand = 'pg_dump "$DATABASE_URL" > backup_YYYYMMDD_HHMMSS.sql';
      await logAdminSystem("BACKUP_ASSISTANT", admin.id, {
        success: true,
        suggestedCommand
      });
      return {
        mode: "assistant",
        suggestedCommand,
        note: "Ejecuta el comando en consola del servidor y verifica el archivo generado."
      };
    }

    return withOperationLock("BACKUP_CREATE", async () => {
      const executed = runScript("scripts/db_backup.ts", []);
      const report = executed.parsedJson || {};
      const success = Boolean(report.success);
      const backupFile = typeof report.backupFile === "string" ? report.backupFile : null;
      const manifestFile = typeof report.manifestFile === "string" ? report.manifestFile : null;
      const sizeBytes = typeof report.sizeBytes === "number" ? report.sizeBytes : null;

      await logAdminSystem("BACKUP_CREATE", admin.id, {
        success,
        backupFile,
        manifestFile,
        sizeBytes
      });

      return {
        success,
        backupFile,
        manifestFile,
        sizeBytes,
        latestBackup: findLatestBackupManifest()
      };
    });
  }

  static async localProductionPrepare(input: LocalPrepareInput, actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    if (input.confirmText !== REQUIRED_PREPARE_CONFIRM) {
      throw new AppError(`Confirmacion invalida. Escribe exactamente: ${REQUIRED_PREPARE_CONFIRM}`, 400, "CONFIRMATION_MISMATCH");
    }
    if (!input.acceptedDataLossRisk) {
      throw new AppError("Debes aceptar el riesgo de perdida de datos para continuar.", 400, "RISK_NOT_ACCEPTED");
    }

    assertLocalProductionPrepareEnabled();

    const withAi = Boolean(input.withAi);
    const aiCount = Math.max(1, Math.min(10, Number(input.aiCount || 5)));
    const latestBackup = findLatestBackupManifest();
    const requestedBackupPath = input.backupFile ? path.resolve(process.cwd(), input.backupFile) : latestBackup?.backupAbsolutePath || null;

    if (!requestedBackupPath || !fs.existsSync(requestedBackupPath)) {
      throw new AppError("No se encontro backup valido. Crea backup antes de preparar produccion local.", 409, "BACKUP_REQUIRED");
    }

    const backupAgeMs = Date.now() - fs.statSync(requestedBackupPath).mtimeMs;
    if (backupAgeMs > BACKUP_VALIDITY_MS) {
      throw new AppError("El backup es antiguo. Genera un backup reciente antes de continuar.", 409, "BACKUP_OUTDATED");
    }

    const suggestedCommand = [
      "$env:LOCAL_PRODUCTION_PREPARE='true';",
      "npm run db:prepare:local-production --",
      `--backup-file=${path.relative(process.cwd(), requestedBackupPath).split(path.sep).join("/")}`,
      "--confirm-local-production-reset",
      `--with-ai=${withAi ? "true" : "false"}`,
      `--ai-count=${aiCount}`,
      input.departamento ? `--departamento=${input.departamento}` : ""
    ]
      .filter(Boolean)
      .join(" ");

    if (!input.execute) {
      await logAdminSystem("LOCAL_PRODUCTION_PREPARE_ASSISTANT", admin.id, {
        success: true,
        withAi,
        aiCount
      });
      return {
        mode: "assistant",
        execute: false,
        withAi,
        aiCount,
        backupFile: path.relative(process.cwd(), requestedBackupPath).split(path.sep).join("/"),
        suggestedCommand,
        requirements: [
          "Confirma que no existen datos definitivos.",
          "Mantener LOCAL_PRODUCTION_PREPARE=true solo durante la preparacion.",
          "Validar smoke test por rol al finalizar."
        ]
      };
    }

    return withOperationLock("LOCAL_PRODUCTION_PREPARE", async () => {
      const args = [
        "--confirm-local-production-reset",
        `--backup-file=${path.relative(process.cwd(), requestedBackupPath).split(path.sep).join("/")}`,
        `--with-ai=${withAi ? "true" : "false"}`,
        `--ai-count=${aiCount}`
      ];
      if (input.departamento) {
        args.push(`--departamento=${input.departamento}`);
      }

      const executed = runScript("scripts/db_prepare_local_production.ts", args, {
        LOCAL_PRODUCTION_PREPARE: "true"
      });
      const report = executed.parsedJson || {};
      const success = Boolean(report.success);

      await logAdminSystem("LOCAL_PRODUCTION_PREPARE", admin.id, {
        success,
        withAi,
        aiCount,
        departamento: input.departamento || null
      });

      return {
        success,
        mode: "execute",
        withAi,
        aiCount,
        summary: report
      };
    });
  }

  static async operations(actor?: ActorUser) {
    assertAdminActor(actor);
    const rows = await prisma.auditLog.findMany({
      where: {
        entidad: ADMIN_SYSTEM_ENTITY
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: {
              select: {
                code: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    });

    return {
      lock: {
        running: operationLock.running,
        action: operationLock.action,
        startedAt: operationLock.startedAt
      },
      items: rows.map((row) => ({
        id: row.id,
        action: row.accion,
        status: ((row.datos as JsonRecord)?.success ? "SUCCESS" : "INFO") as "SUCCESS" | "INFO",
        message: (row.datos as JsonRecord)?.message || null,
        metadata: row.datos,
        createdAt: row.createdAt.toISOString(),
        admin: row.user
          ? {
              id: row.user.id,
              name: row.user.name,
              email: row.user.email,
              role: row.user.role.code
            }
          : null
      }))
    };
  }

  static async checklist(actor?: ActorUser) {
    assertAdminActor(actor);
    return {
      updatedAt: nowIso(),
      items: await getChecklistStateFromLogs()
    };
  }

  static async updateChecklist(itemId: string, input: ChecklistUpdateInput, actor?: ActorUser) {
    const admin = assertAdminActor(actor);
    const safeId = sanitizeChecklistItem(itemId);
    await logAdminSystem("CHECKLIST_UPDATE", admin.id, {
      success: true,
      itemId: safeId,
      checked: input.checked,
      note: input.note || null
    });
    return {
      success: true,
      itemId: safeId,
      checked: input.checked,
      note: input.note || null
    };
  }

  private static async getApplyPrerequisites() {
    const [lastDryRun, latestBackup] = await Promise.all([
      getLastSuccessfulAudit("SCHOOLS_IMPORT_DRY_RUN"),
      Promise.resolve(findLatestBackupManifest())
    ]);

    const hasRecentDryRun =
      Boolean(lastDryRun?.entry) && Date.now() - (lastDryRun?.entry.createdAt?.getTime() || 0) <= DRY_RUN_VALIDITY_MS;
    const hasRecentBackup = Boolean(latestBackup && latestBackup.ageMs <= BACKUP_VALIDITY_MS);

    return {
      hasRecentDryRun,
      hasRecentBackup,
      lastDryRunAt: lastDryRun?.entry.createdAt.toISOString() || null,
      latestBackup: latestBackup
        ? {
            backupPath: latestBackup.backupPath,
            createdAt: latestBackup.createdAt,
            sizeBytes: latestBackup.sizeBytes
          }
        : null
    };
  }
}
