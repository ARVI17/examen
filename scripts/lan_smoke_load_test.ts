import http from "http";
import https from "https";
import { URL } from "url";

type StatusMap = Record<string, number>;
type EndpointStats = {
  requests: number;
  ok: number;
  errors: number;
  latenciesMs: number[];
  statuses: StatusMap;
};

const baseUrl = (process.env.LAN_LOAD_BASE_URL || process.env.BASE_URL || "http://api:4000").replace(/\/+$/, "");
const timeoutMs = Number.isFinite(Number(process.env.LAN_LOAD_TIMEOUT_MS))
  ? Math.max(1_000, Math.min(20_000, Number(process.env.LAN_LOAD_TIMEOUT_MS)))
  : 8_000;
const rounds = Number.isFinite(Number(process.env.LAN_LOAD_ROUNDS))
  ? Math.max(1, Math.min(20, Number(process.env.LAN_LOAD_ROUNDS)))
  : 1;
const levels = String(process.env.LAN_LOAD_CONCURRENCY || "5,10,25,50")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const endpoints = String(process.env.LAN_LOAD_ENDPOINTS || "/health,/health/ready,/admin/,/simulador/,/connection-info")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0)
  .map((value) => (value.startsWith("/") ? value : `/${value}`));

if (!levels.length) {
  throw new Error("No se definieron niveles de concurrencia validos.");
}

if (!endpoints.length) {
  throw new Error("No se definieron endpoints para prueba.");
}

const ensureEndpointStats = (bucket: Record<string, EndpointStats>, endpoint: string) => {
  if (!bucket[endpoint]) {
    bucket[endpoint] = {
      requests: 0,
      ok: 0,
      errors: 0,
      latenciesMs: [],
      statuses: {}
    };
  }
  return bucket[endpoint];
};

const percentile = (values: number[], pct: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[idx];
};

const avg = (values: number[]) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const requestOnce = async (fullUrl: string) => {
  const parsed = new URL(fullUrl);
  const transport = parsed.protocol === "https:" ? https : http;
  const startedAt = process.hrtime.bigint();

  return new Promise<{ statusCode: number; latencyMs: number }>((resolve, reject) => {
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        timeout: timeoutMs
      },
      (res) => {
        res.on("data", () => undefined);
        res.on("end", () => {
          const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          resolve({
            statusCode: res.statusCode || 0,
            latencyMs
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timeout ${timeoutMs}ms`));
    });
    req.on("error", (error) => reject(error));
    req.end();
  });
};

const runLevel = async (concurrency: number) => {
  const endpointStats: Record<string, EndpointStats> = {};
  let pointer = 0;

  for (let round = 0; round < rounds; round += 1) {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const endpoint = endpoints[pointer % endpoints.length];
        pointer += 1;
        const bucket = ensureEndpointStats(endpointStats, endpoint);
        bucket.requests += 1;
        const fullUrl = `${baseUrl}${endpoint}`;
        try {
          const result = await requestOnce(fullUrl);
          const statusKey = String(result.statusCode);
          bucket.statuses[statusKey] = (bucket.statuses[statusKey] || 0) + 1;
          if (result.statusCode >= 200 && result.statusCode < 400) bucket.ok += 1;
          else bucket.errors += 1;
          bucket.latenciesMs.push(result.latencyMs);
        } catch {
          bucket.errors += 1;
          bucket.statuses.ERR = (bucket.statuses.ERR || 0) + 1;
        }
      })
    );
  }

  const perEndpoint = endpoints.map((endpoint) => {
    const stats = ensureEndpointStats(endpointStats, endpoint);
    return {
      endpoint,
      requests: stats.requests,
      ok: stats.ok,
      errors: stats.errors,
      avgMs: Number(avg(stats.latenciesMs).toFixed(2)),
      p95Ms: Number(percentile(stats.latenciesMs, 95).toFixed(2)),
      statuses: stats.statuses
    };
  });

  const totalRequests = perEndpoint.reduce((sum, row) => sum + row.requests, 0);
  const totalOk = perEndpoint.reduce((sum, row) => sum + row.ok, 0);
  const totalErrors = perEndpoint.reduce((sum, row) => sum + row.errors, 0);
  const allLatencies = perEndpoint.flatMap((row) => {
    const stats = ensureEndpointStats(endpointStats, row.endpoint);
    return stats.latenciesMs;
  });
  const slowest = [...perEndpoint].sort((a, b) => b.p95Ms - a.p95Ms)[0] || null;

  return {
    concurrency,
    rounds,
    totalRequests,
    totalOk,
    totalErrors,
    errorRatePct: totalRequests ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
    avgMs: Number(avg(allLatencies).toFixed(2)),
    p95Ms: Number(percentile(allLatencies, 95).toFixed(2)),
    slowestEndpoint: slowest?.endpoint || "-",
    slowestP95Ms: slowest?.p95Ms || 0,
    endpoints: perEndpoint
  };
};

const main = async () => {
  console.log(
    `[lan-load] base=${baseUrl} rounds=${rounds} timeoutMs=${timeoutMs} levels=${levels.join(",")} endpoints=${endpoints.join(",")}`
  );

  for (const level of levels) {
    const report = await runLevel(level);
    console.log(`[lan-load] concurrency=${report.concurrency} total=${report.totalRequests} ok=${report.totalOk} errors=${report.totalErrors}`);
    console.log(
      `[lan-load] avgMs=${report.avgMs} p95Ms=${report.p95Ms} errorRate=${report.errorRatePct}% slowest=${report.slowestEndpoint} slowestP95=${report.slowestP95Ms}`
    );
    report.endpoints.forEach((row) => {
      console.log(
        `[lan-load] endpoint=${row.endpoint} req=${row.requests} ok=${row.ok} err=${row.errors} avgMs=${row.avgMs} p95Ms=${row.p95Ms} statuses=${JSON.stringify(
          row.statuses
        )}`
      );
    });
  }
};

void main();
