import { RateLimiterMemory } from "rate-limiter-flexible";
import { AppError } from "../../common/errors/AppError";
import { config } from "../../config";

const loginFailuresByIp = new RateLimiterMemory({
  points: config.authLoginMaxWrongByIp,
  duration: 60 * 60,
  blockDuration: config.authLoginBlockDurationSeconds
});

const loginFailuresByUserAndIp = new RateLimiterMemory({
  points: config.authLoginMaxWrongByUserIp,
  duration: 60 * 60,
  blockDuration: config.authLoginBlockDurationSeconds
});

const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, "") || "unknown";
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isBlockedState = (state: {
  remainingPoints?: number;
  msBeforeNext?: number;
} | null | undefined) =>
  typeof state?.remainingPoints === "number" &&
  state.remainingPoints <= 0 &&
  typeof state.msBeforeNext === "number" &&
  state.msBeforeNext > 0;

export class AuthSecurityService {
  static async ensureLoginAllowed(email: string, ip: string) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedIp = normalizeIp(ip);
    const userAndIpKey = `${normalizedEmail}_${normalizedIp}`;

    const [ipState, userAndIpState] = await Promise.all([
      loginFailuresByIp.get(normalizedIp),
      loginFailuresByUserAndIp.get(userAndIpKey)
    ]);

    const ipRetryAfterMs = isBlockedState(ipState) && typeof ipState?.msBeforeNext === "number" ? ipState.msBeforeNext : 0;
    const userAndIpRetryAfterMs =
      isBlockedState(userAndIpState) && typeof userAndIpState?.msBeforeNext === "number"
        ? userAndIpState.msBeforeNext
        : 0;
    const retryAfterMs = Math.max(ipRetryAfterMs, userAndIpRetryAfterMs);

    if (retryAfterMs > 0) {
      throw new AppError(
        "Cuenta temporalmente bloqueada por multiples intentos fallidos",
        429,
        "AUTH_TEMPORARILY_BLOCKED",
        { retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
      );
    }
  }

  static async registerFailedAttempt(email: string, ip: string) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedIp = normalizeIp(ip);
    const userAndIpKey = `${normalizedEmail}_${normalizedIp}`;

    await Promise.allSettled([
      loginFailuresByIp.consume(normalizedIp),
      loginFailuresByUserAndIp.consume(userAndIpKey)
    ]);
  }

  static async clearSuccessfulAttempt(email: string, ip: string) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedIp = normalizeIp(ip);
    const userAndIpKey = `${normalizedEmail}_${normalizedIp}`;

    await Promise.allSettled([loginFailuresByUserAndIp.delete(userAndIpKey)]);
  }
}
