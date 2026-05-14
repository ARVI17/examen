import { Router } from "express";
import { RoleCode } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { adminRouteRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { SchoolsController } from "./schools.controller";
import {
  createSchoolGroupSchema,
  createSchoolSchema,
  groupParamsSchema,
  listSchoolDepartmentsQuerySchema,
  listSchoolGroupsQuerySchema,
  listSchoolMunicipalitiesQuerySchema,
  listSchoolsQuerySchema,
  schoolParamsSchema,
  updateSchoolGroupSchema,
  updateSchoolSchema
} from "./schools.schema";

const router = Router();

router.use(authenticate, adminRouteRateLimiter);

router.get("/", authorize(RoleCode.ADMIN, RoleCode.DOCENTE), validateRequest({ query: listSchoolsQuerySchema }), SchoolsController.listSchools);
router.get(
  "/departments",
  authorize(RoleCode.ADMIN, RoleCode.DOCENTE),
  validateRequest({ query: listSchoolDepartmentsQuerySchema }),
  SchoolsController.listDepartments
);
router.get(
  "/municipalities",
  authorize(RoleCode.ADMIN, RoleCode.DOCENTE),
  validateRequest({ query: listSchoolMunicipalitiesQuerySchema }),
  SchoolsController.listMunicipalities
);
router.get("/:id", authorize(RoleCode.ADMIN, RoleCode.DOCENTE), validateRequest({ params: schoolParamsSchema }), SchoolsController.getSchoolById);
router.get(
  "/:id/groups",
  authorize(RoleCode.ADMIN, RoleCode.DOCENTE),
  validateRequest({ params: schoolParamsSchema, query: listSchoolGroupsQuerySchema }),
  SchoolsController.listGroups
);

router.post("/", authorize(RoleCode.ADMIN), validateRequest({ body: createSchoolSchema }), SchoolsController.createSchool);
router.patch(
  "/:id",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: schoolParamsSchema, body: updateSchoolSchema }),
  SchoolsController.updateSchool
);
router.post(
  "/:id/groups",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: schoolParamsSchema, body: createSchoolGroupSchema }),
  SchoolsController.createGroup
);
router.patch(
  "/groups/:groupId",
  authorize(RoleCode.ADMIN),
  validateRequest({ params: groupParamsSchema, body: updateSchoolGroupSchema }),
  SchoolsController.updateGroup
);

export default router;
