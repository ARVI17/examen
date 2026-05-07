import { Prisma, RoleCode } from "@prisma/client";
import { AppError } from "../errors/AppError";

type UserScopeShape = {
  schoolIds: string[];
  groupIds: string[];
};

type RequestUserShape = {
  id: string;
  role: RoleCode;
  scope?: UserScopeShape;
};

type StudentScopeShape = {
  schoolId: string | null;
  groupId: string | null;
};

type ExamAssignmentScopeShape = {
  scope: string;
  schoolId?: string | null;
  groupId?: string | null;
  student?: StudentScopeShape | null;
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export const getNormalizedScope = (user?: RequestUserShape) => {
  const schoolIds = unique(user?.scope?.schoolIds ?? []);
  const groupIds = unique(user?.scope?.groupIds ?? []);
  return { schoolIds, groupIds };
};

export const isAdminUser = (user?: RequestUserShape) => user?.role === RoleCode.ADMIN;
export const isDocenteUser = (user?: RequestUserShape) => user?.role === RoleCode.DOCENTE;

export const ensureDocenteScopeConfigured = (user?: RequestUserShape) => {
  if (!isDocenteUser(user)) {
    return;
  }

  const scope = getNormalizedScope(user);
  if (scope.schoolIds.length === 0 && scope.groupIds.length === 0) {
    throw new AppError(
      "El docente no tiene colegios o grupos asignados. Solicita asignacion al administrador.",
      403,
      "DOCENTE_SCOPE_NOT_CONFIGURED"
    );
  }
};

export const assertDocenteCanUseSchool = (user: RequestUserShape | undefined, schoolId?: string | null) => {
  if (!isDocenteUser(user) || !schoolId) {
    return;
  }

  ensureDocenteScopeConfigured(user);
  const scope = getNormalizedScope(user);
  if (!scope.schoolIds.includes(schoolId)) {
    throw new AppError("No autorizado para este colegio", 403, "DOCENTE_SCOPE_FORBIDDEN");
  }
};

export const assertDocenteCanUseGroup = (user: RequestUserShape | undefined, groupId?: string | null) => {
  if (!isDocenteUser(user) || !groupId) {
    return;
  }

  ensureDocenteScopeConfigured(user);
  const scope = getNormalizedScope(user);
  if (!scope.groupIds.includes(groupId)) {
    throw new AppError("No autorizado para este grupo", 403, "DOCENTE_SCOPE_FORBIDDEN");
  }
};

export const canAccessSchool = (user: RequestUserShape | undefined, schoolId?: string | null) => {
  if (!isDocenteUser(user) || !schoolId) {
    return true;
  }

  const scope = getNormalizedScope(user);
  return scope.schoolIds.includes(schoolId);
};

export const canAccessGroup = (user: RequestUserShape | undefined, groupId?: string | null) => {
  if (!isDocenteUser(user) || !groupId) {
    return true;
  }

  const scope = getNormalizedScope(user);
  return scope.groupIds.includes(groupId);
};

export const canAccessStudent = (user: RequestUserShape | undefined, student: StudentScopeShape) => {
  if (!isDocenteUser(user)) {
    return true;
  }

  const scope = getNormalizedScope(user);
  const byGroup = student.groupId ? scope.groupIds.includes(student.groupId) : false;
  const bySchool = student.schoolId ? scope.schoolIds.includes(student.schoolId) : false;
  return byGroup || bySchool;
};

export const assertCanAccessStudent = (user: RequestUserShape | undefined, student: StudentScopeShape) => {
  if (!isDocenteUser(user)) {
    return;
  }

  ensureDocenteScopeConfigured(user);
  if (!canAccessStudent(user, student)) {
    throw new AppError("No autorizado para este estudiante", 403, "DOCENTE_SCOPE_FORBIDDEN");
  }
};

export const canAccessExamAssignment = (user: RequestUserShape | undefined, assignment: ExamAssignmentScopeShape) => {
  if (!isDocenteUser(user)) {
    return true;
  }

  const scope = getNormalizedScope(user);
  const assignmentScope = String(assignment.scope || "").toUpperCase();

  if (assignmentScope === "GLOBAL") {
    return true;
  }

  if (assignmentScope === "SCHOOL") {
    return Boolean(assignment.schoolId && scope.schoolIds.includes(assignment.schoolId));
  }

  if (assignmentScope === "GROUP") {
    if (assignment.groupId && scope.groupIds.includes(assignment.groupId)) {
      return true;
    }
    return Boolean(assignment.schoolId && scope.schoolIds.includes(assignment.schoolId));
  }

  if (assignmentScope === "STUDENT") {
    const studentSchoolId = assignment.student?.schoolId ?? null;
    const studentGroupId = assignment.student?.groupId ?? null;
    if (studentGroupId && scope.groupIds.includes(studentGroupId)) {
      return true;
    }
    return Boolean(studentSchoolId && scope.schoolIds.includes(studentSchoolId));
  }

  return false;
};

export const canAccessExamAssignments = (user: RequestUserShape | undefined, assignments: ExamAssignmentScopeShape[]) => {
  if (!isDocenteUser(user)) {
    return true;
  }

  if (!assignments.length) {
    return false;
  }

  return assignments.some((assignment) => canAccessExamAssignment(user, assignment));
};

export const assertCanAccessExamAssignments = (
  user: RequestUserShape | undefined,
  assignments: ExamAssignmentScopeShape[]
) => {
  if (!isDocenteUser(user)) {
    return;
  }

  ensureDocenteScopeConfigured(user);
  if (!canAccessExamAssignments(user, assignments)) {
    throw new AppError("No autorizado para esta prueba", 403, "DOCENTE_SCOPE_FORBIDDEN");
  }
};

export const buildTeacherScopeWhere = (user: RequestUserShape | undefined): Prisma.StudentWhereInput | undefined => {
  if (!isDocenteUser(user)) {
    return undefined;
  }

  ensureDocenteScopeConfigured(user);
  const scope = getNormalizedScope(user);
  const scopeOr: Prisma.StudentWhereInput[] = [];

  if (scope.groupIds.length > 0) {
    scopeOr.push({ groupId: { in: scope.groupIds } });
  }

  if (scope.schoolIds.length > 0) {
    scopeOr.push({ schoolId: { in: scope.schoolIds } });
  }

  if (scopeOr.length === 0) {
    throw new AppError(
      "El docente no tiene colegios o grupos asignados. Solicita asignacion al administrador.",
      403,
      "DOCENTE_SCOPE_NOT_CONFIGURED"
    );
  }

  return { OR: scopeOr };
};

export const assertStudentOwnership = (sessionStudentId: string, targetStudentId: string) => {
  if (!sessionStudentId || sessionStudentId !== targetStudentId) {
    throw new AppError("No autorizado para este recurso", 403, "FORBIDDEN");
  }
};

export const resolveScopedSchoolOrGroup = (
  user: RequestUserShape | undefined,
  query: { schoolId?: string; groupId?: string }
) => {
  if (!isDocenteUser(user)) {
    return query;
  }

  ensureDocenteScopeConfigured(user);
  const scope = getNormalizedScope(user);
  const schoolId = query.schoolId;
  const groupId = query.groupId;

  if (groupId) {
    assertDocenteCanUseGroup(user, groupId);
    return { schoolId, groupId };
  }

  if (schoolId) {
    assertDocenteCanUseSchool(user, schoolId);
    return { schoolId, groupId };
  }

  if (scope.groupIds.length === 1) {
    return { schoolId, groupId: scope.groupIds[0] };
  }

  if (scope.schoolIds.length === 1) {
    return { schoolId: scope.schoolIds[0], groupId };
  }

  throw new AppError(
    "Debes seleccionar colegio o grupo dentro de tu alcance para esta consulta.",
    400,
    "DOCENTE_SCOPE_FILTER_REQUIRED"
  );
};

export const applyDocenteStudentWhereScope = (
  user: RequestUserShape | undefined,
  where: Prisma.StudentWhereInput
): Prisma.StudentWhereInput => {
  if (!isDocenteUser(user)) {
    return where;
  }

  const teacherScopeWhere = buildTeacherScopeWhere(user);

  const andFilters = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];

  return {
    ...where,
    AND: teacherScopeWhere ? [...andFilters, teacherScopeWhere] : andFilters
  };
};
