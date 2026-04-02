import { AppError } from "../../common/errors/AppError";
import { createAuditLog } from "../../common/utils/audit";
import { PerformanceLevelRepository } from "./performance-levels.repository";

export class PerformanceLevelService {
  static async create(payload: {
    nombre: string;
    minimo: number;
    maximo: number;
    scope: string;
    isActive: boolean;
  }, actorId?: string) {
    const exists = await PerformanceLevelRepository.findByName(payload.nombre);

    if (exists) {
      throw new AppError("Ya existe un nivel con ese nombre", 409, "PERFORMANCE_LEVEL_EXISTS");
    }

    const created = await PerformanceLevelRepository.create(payload);

    await createAuditLog({
      entidad: "performance_levels",
      entidadId: created.id,
      accion: "CREATE",
      userId: actorId,
      datos: payload
    });

    return created;
  }

  static async list() {
    return PerformanceLevelRepository.list();
  }

  static async update(id: string, payload: {
    nombre?: string;
    minimo?: number;
    maximo?: number;
    scope?: string;
    isActive?: boolean;
  }, actorId?: string) {
    const existing = await PerformanceLevelRepository.findById(id);

    if (!existing) {
      throw new AppError("Nivel no encontrado", 404, "NOT_FOUND");
    }

    if (payload.minimo !== undefined && payload.maximo !== undefined && payload.minimo > payload.maximo) {
      throw new AppError("minimo no puede ser mayor que maximo", 400, "VALIDATION_ERROR");
    }

    const updated = await PerformanceLevelRepository.update(id, payload);

    await createAuditLog({
      entidad: "performance_levels",
      entidadId: id,
      accion: "UPDATE",
      userId: actorId,
      datos: {
        before: {
          nombre: existing.nombre,
          minimo: existing.minimo,
          maximo: existing.maximo,
          scope: existing.scope,
          isActive: existing.isActive
        },
        after: {
          nombre: updated.nombre,
          minimo: updated.minimo,
          maximo: updated.maximo,
          scope: updated.scope,
          isActive: updated.isActive
        }
      }
    });

    return updated;
  }
}
