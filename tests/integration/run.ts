import { randomUUID } from "crypto";
import request from "supertest";
import app from "../../src/app";
import prisma from "../../src/common/prisma";

type TestResult = {
  name: string;
  status: "PASS" | "FAIL";
  details?: string;
};

const results: TestResult[] = [];

const record = (name: string, status: TestResult["status"], details?: string) => {
  results.push({ name, status, details });
};

const ensure = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async (name: string, assertion: () => Promise<void>) => {
  try {
    await assertion();
    record(name, "PASS");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error no controlado";
    record(name, "FAIL", message);
  }
};

const printMatrix = () => {
  const colName = 58;
  const colStatus = 8;
  const divider = `${"-".repeat(colName)}|${"-".repeat(colStatus)}|------------------------------------------`;

  console.log(divider);
  console.log(`${"TEST".padEnd(colName)}|${"STATUS".padEnd(colStatus)}|DETAILS`);
  console.log(divider);

  for (const item of results) {
    console.log(`${item.name.padEnd(colName)}|${item.status.padEnd(colStatus)}|${item.details ?? ""}`);
  }

  console.log(divider);
};

const main = async () => {
  const runId = Date.now();
  const client = request(app);

  await run("API | Malformed JSON body returns 400", async () => {
    const response = await client
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{\"email\":\"admin@saber11.com\",\"password\":\"admin123\"");

    ensure(response.status === 400, `status esperado 400, recibido ${response.status}`);
    ensure(response.body?.success === false, "respuesta esperaba success=false");
    ensure(response.body?.error?.code === "INVALID_JSON", "codigo de error esperado INVALID_JSON");
  });

  await run("AdminSystem | Anonymous cannot access status", async () => {
    const response = await client.get("/api/admin/system/status");
    ensure(response.status === 401, `status esperado 401, recibido ${response.status}`);
  });

  let adminToken = "";
  let createdQuestionId = "";
  let createdExamId = "";
  let outOfScopeExamId = "";
  let createdAttemptId = "";
  let studentAttemptId = "";
  let createdFileId = "";
  let selectedOptionId = "";
  let alternateOptionId = "";
  let studentToken = "";
  let secondStudentToken = "";
  let docenteToken = "";
  let docenteUserId = "";
  let scopedSchoolId = "";
  let outOfScopeSchoolId = "";
  let scopedGroupId = "";
  const testDocument = `IT-${runId}`;
  const publicDocument = `PUB-${runId}`;
  const secondStudentDocument = `PUB2-${runId}`;
  const scopedStudentDocument = `SCP-${runId}`;
  const outScopeStudentDocument = `OUT-${runId}`;
  const testEmail = `it.docente.${runId}@saber11.local`;

  await run("Auth | Invalid login does not lock next valid login", async () => {
    const invalidResponse = await client.post("/api/auth/login").send({
      email: "admin@saber11.com",
      password: "admin123-invalid"
    });

    ensure(invalidResponse.status === 401, `status esperado 401, recibido ${invalidResponse.status}`);
  });

  await run("Auth | Login admin", async () => {
    const response = await client.post("/api/auth/login").send({
      email: "admin@saber11.com",
      password: "admin123"
    });

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.success === true, "login no devolvio success=true");
    ensure(typeof response.body?.data?.token === "string", "token no presente");
    adminToken = response.body.data.token;
  });

  await run("AdminSystem | ADMIN can access status", async () => {
    const response = await client.get("/api/admin/system/status").set("Authorization", `Bearer ${adminToken}`);
    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.success === true, "respuesta esperaba success=true");
  });

  await run("AdminSystem | Apply fails without exact confirmText", async () => {
    const response = await client
      .post("/api/admin/system/schools/import/apply")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        confirmText: "IMPORTAR COLEGIOS",
        acceptedRisk: true
      });

    ensure(response.status === 400, `status esperado 400, recibido ${response.status}`);
  });

  await run("AdminSystem | Apply fails without acceptedRisk", async () => {
    const response = await client
      .post("/api/admin/system/schools/import/apply")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        confirmText: "IMPORTAR COLEGIOS COLOMBIA",
        acceptedRisk: false
      });

    ensure(response.status === 400, `status esperado 400, recibido ${response.status}`);
  });

  await run("AdminSystem | Prepare fails without exact confirmText", async () => {
    const response = await client
      .post("/api/admin/system/local-production/prepare")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        confirmText: "PREPARAR LOCAL",
        acceptedDataLossRisk: true
      });

    ensure(response.status === 400, `status esperado 400, recibido ${response.status}`);
  });

  await run("AdminSystem | Prepare fails without acceptedDataLossRisk", async () => {
    const response = await client
      .post("/api/admin/system/local-production/prepare")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        confirmText: "PREPARAR PRODUCCION LOCAL",
        acceptedDataLossRisk: false
      });

    ensure(response.status === 400, `status esperado 400, recibido ${response.status}`);
  });

  await run("Auth | Register blocked without ADMIN token", async () => {
    const response = await client.post("/api/auth/register").send({
      name: "Docente IT",
      email: testEmail,
      password: "admin12345",
      role: "DOCENTE"
    });

    ensure(response.status === 401, `status esperado 401, recibido ${response.status}`);
    ensure(response.body?.success === false, "respuesta esperaba success=false");
  });

  await run("Auth | Register DOCENTE with ADMIN token", async () => {
    const response = await client
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Docente IT",
        email: testEmail,
        password: "admin12345",
        role: "DOCENTE"
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    ensure(response.body?.data?.email === testEmail.toLowerCase(), "correo registrado invalido");
    docenteUserId = response.body?.data?.id ?? response.body?.data?.user?.id ?? "";
  });

  await run("Users | Resolve DOCENTE id", async () => {
    if (!docenteUserId) {
      const lookupResponse = await client
        .get(`/api/users?q=${encodeURIComponent(testEmail)}`)
        .set("Authorization", `Bearer ${adminToken}`);

      ensure(lookupResponse.status === 200, `status esperado 200, recibido ${lookupResponse.status}`);
      const docente = (lookupResponse.body?.data?.items || []).find(
        (item: { email?: string; id?: string }) => item.email === testEmail.toLowerCase()
      );
      docenteUserId = docente?.id || "";
    }

    ensure(Boolean(docenteUserId), "docente id no disponible");
  });

  await run("Schools | Create scoped school", async () => {
    const response = await client
      .post("/api/schools")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `SCH-SCP-${runId}`,
        name: `Colegio Scope ${runId}`
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    scopedSchoolId = response.body?.data?.id;
    ensure(Boolean(scopedSchoolId), "school id scope no generado");
  });

  await run("Schools | Create out-of-scope school", async () => {
    const response = await client
      .post("/api/schools")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `SCH-OUT-${runId}`,
        name: `Colegio Out ${runId}`
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    outOfScopeSchoolId = response.body?.data?.id;
    ensure(Boolean(outOfScopeSchoolId), "school id out-of-scope no generado");
  });

  await run("Schools | Create scoped group", async () => {
    const response = await client
      .post(`/api/schools/${scopedSchoolId}/groups`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `GRP-SCP-${runId}`,
        name: `Grupo Scope ${runId}`,
        grade: "11",
        academic_year: 2026
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    scopedGroupId = response.body?.data?.id;
    ensure(Boolean(scopedGroupId), "group id scope no generado");
  });

  await run("Users | Assign DOCENTE scope", async () => {
    const response = await client
      .put(`/api/users/${docenteUserId}/scopes`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        scope_school_ids: [scopedSchoolId],
        scope_group_ids: [scopedGroupId]
      });

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
  });

  await run("Auth | Login DOCENTE", async () => {
    const response = await client.post("/api/auth/login").send({
      email: testEmail,
      password: "admin12345"
    });

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(typeof response.body?.data?.token === "string", "token docente no presente");
    docenteToken = response.body.data.token;
  });

  await run("AdminSystem | DOCENTE cannot access status", async () => {
    const response = await client.get("/api/admin/system/status").set("Authorization", `Bearer ${docenteToken}`);
    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("AdminSystem | Dry-run requires ADMIN", async () => {
    const response = await client
      .post("/api/admin/system/schools/import/dry-run")
      .set("Authorization", `Bearer ${docenteToken}`)
      .send({
        datasetId: "cfw5-qzt5",
        limit: 5
      });

    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("DOCENTE | Scope keeps access to assigned school", async () => {
    const response = await client.get("/api/schools").set("Authorization", `Bearer ${docenteToken}`);

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    const schoolIds = (response.body?.data?.items || []).map((item: { id?: string }) => item.id);
    ensure(schoolIds.includes(scopedSchoolId), "docente no ve colegio asignado");
    ensure(!schoolIds.includes(outOfScopeSchoolId), "docente ve colegio fuera de alcance");
  });

  await run("DOCENTE | Cannot create exam (ADMIN only)", async () => {
    const response = await client
      .post("/api/exams")
      .set("Authorization", `Bearer ${docenteToken}`)
      .send({
        nombre: `DOCENTE EXAM ${runId}`,
        tipo_prueba: "SIMULACRO",
        grado_objetivo: "11"
      });

    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("Files | Protected route requires token", async () => {
    const response = await client.get("/api/files");
    ensure(response.status === 401, `status esperado 401, recibido ${response.status}`);
  });

  await run("Files | Upload JSON valid file", async () => {
    const payload = Buffer.from(JSON.stringify({ test: "integration", runId }), "utf-8");
    const response = await client
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("categoria", "SIMULACROS")
      .field("grado_objetivo", "11")
      .field("tipo_prueba", "Saber 11")
      .field("descripcion", "archivo de prueba de integracion")
      .attach("file", payload, {
        filename: `integration_${runId}.json`,
        contentType: "application/json"
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    ensure(response.body?.data?.id, "file id no generado");
    createdFileId = response.body.data.id;
  });

  await run("Questions | Create question", async () => {
    const response = await client
      .post("/api/questions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        codigo_interno: `IT-Q-${runId}`,
        area: "MATEMATICAS",
        competencia: "Resolucion",
        componente: "Algebra",
        nivel_dificultad: "MEDIO",
        nivel_cognitivo: "Analisis",
        enunciado: "Si 2 + 2 = ?",
        tipo_pregunta: "SELECCION_UNICA",
        grado_objetivo: "11",
        opciones: [
          { texto_opcion: "3", es_correcta: false, orden: 1 },
          { texto_opcion: "4", es_correcta: true, orden: 2 },
          { texto_opcion: "5", es_correcta: false, orden: 3 }
        ]
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    createdQuestionId = response.body?.data?.id;
    selectedOptionId = response.body?.data?.options?.find((item: { esCorrecta: boolean }) => item.esCorrecta)?.id;
    ensure(Boolean(createdQuestionId), "question id no generado");
    ensure(Boolean(selectedOptionId), "opcion correcta no encontrada");
  });

  await run("Questions | Resolve alternate option", async () => {
    const option = await prisma.questionOption.findFirst({
      where: {
        preguntaId: createdQuestionId,
        id: {
          not: selectedOptionId
        }
      },
      select: {
        id: true
      }
    });

    alternateOptionId = option?.id || "";
    ensure(Boolean(alternateOptionId), "opcion alternativa no encontrada");
  });

  await run("Exams | Create exam", async () => {
    const response = await client
      .post("/api/exams")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        nombre: `IT EXAM ${runId}`,
        descripcion: "examen de integracion",
        tipo_prueba: "SIMULACRO",
        grado_objetivo: "11",
        tiempo_limite_minutos: 30,
        puntaje_maximo: 10
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    createdExamId = response.body?.data?.id;
    ensure(Boolean(createdExamId), "exam id no generado");
  });

  await run("Exams | Create out-of-scope exam", async () => {
    const response = await client
      .post("/api/exams")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        nombre: `IT OUT EXAM ${runId}`,
        descripcion: "examen fuera de alcance docente",
        tipo_prueba: "SIMULACRO",
        grado_objetivo: "11",
        tiempo_limite_minutos: 30,
        puntaje_maximo: 10
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    outOfScopeExamId = response.body?.data?.id;
    ensure(Boolean(outOfScopeExamId), "exam out-of-scope id no generado");
  });

  await run("Exams | Assign question", async () => {
    const response = await client
      .post(`/api/exams/${createdExamId}/questions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        questions: [
          {
            pregunta_id: createdQuestionId,
            orden: 1,
            puntaje_pregunta: 1
          }
        ]
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    ensure(response.body?.data?.addedCount === 1, "no se asigno la pregunta");
  });

  await run("Exams | Publish exam", async () => {
    const response = await client
      .patch(`/api/exams/${createdExamId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        estado: "PUBLICADO"
      });

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.estado === "PUBLICADO", "estado de prueba no publicado");
  });

  await run("Exams | Create GLOBAL assignment", async () => {
    const response = await client
      .post(`/api/exams/${createdExamId}/assignments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        scope: "GLOBAL",
        max_attempts: 2,
        allow_retake: true
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    ensure(response.body?.data?.scope === "GLOBAL", "asignacion global no creada");
  });

  await run("Exams | Create out-of-scope SCHOOL assignment", async () => {
    const response = await client
      .post(`/api/exams/${outOfScopeExamId}/assignments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        scope: "SCHOOL",
        school_id: outOfScopeSchoolId,
        max_attempts: 1,
        allow_retake: false
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    ensure(response.body?.data?.scope === "SCHOOL", "asignacion out-of-scope no creada");
  });

  await run("Exams | Public list", async () => {
    const response = await client.get("/api/exams/public?grado_objetivo=11");
    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(Array.isArray(response.body?.data?.items), "items de examenes publicos no es arreglo");
  });

  await run("Attempts | Start attempt with create-or-find student", async () => {
    const response = await client
      .post("/api/attempts/start")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        prueba_id: createdExamId,
        estudiante: {
          nombres: "Estudiante",
          apellidos: "Integracion",
          tipo_identificacion: "TI",
          numero_identificacion: testDocument,
          grado: "11"
        }
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    createdAttemptId = response.body?.data?.attempt?.id;
    ensure(Boolean(createdAttemptId), "attempt id no generado");
  });

  await run("Students | Create student for public flow", async () => {
    const response = await client
      .post("/api/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        nombres: "Publico",
        apellidos: "Integracion",
        tipo_identificacion: "TI",
        numero_identificacion: publicDocument,
        grado: "11"
      });

    ensure([200, 201].includes(response.status), `status esperado 200|201, recibido ${response.status}`);
  });

  await run("Students | Create second student for cross-access checks", async () => {
    const response = await client
      .post("/api/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        nombres: "Publico",
        apellidos: "Secundario",
        tipo_identificacion: "TI",
        numero_identificacion: secondStudentDocument,
        grado: "11"
      });

    ensure([200, 201].includes(response.status), `status esperado 200|201, recibido ${response.status}`);
  });

  await run("Students | Create scoped student", async () => {
    const response = await client
      .post("/api/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        nombres: "Scope",
        apellidos: "Estudiante",
        tipo_identificacion: "TI",
        numero_identificacion: scopedStudentDocument,
        grado: "11",
        school_id: scopedSchoolId,
        group_id: scopedGroupId
      });

    ensure([200, 201].includes(response.status), `status esperado 200|201, recibido ${response.status}`);
  });

  await run("Students | Create out-of-scope student", async () => {
    const response = await client
      .post("/api/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        nombres: "Out",
        apellidos: "Scope",
        tipo_identificacion: "TI",
        numero_identificacion: outScopeStudentDocument,
        grado: "11",
        school_id: outOfScopeSchoolId
      });

    ensure([200, 201].includes(response.status), `status esperado 200|201, recibido ${response.status}`);
  });

  await run("DOCENTE | Can list assigned students and block out-of-scope student", async () => {
    const listResponse = await client
      .get(`/api/students?school_id=${scopedSchoolId}`)
      .set("Authorization", `Bearer ${docenteToken}`);

    ensure(listResponse.status === 200, `status esperado 200, recibido ${listResponse.status}`);
    const docs = (listResponse.body?.data?.items || []).map(
      (item: { numeroIdentificacion?: string }) => item.numeroIdentificacion
    );
    ensure(docs.includes(scopedStudentDocument), "docente no ve estudiante en alcance");

    const blockedResponse = await client
      .get(`/api/students/document/${outScopeStudentDocument}`)
      .set("Authorization", `Bearer ${docenteToken}`);

    ensure(blockedResponse.status === 403, `status esperado 403, recibido ${blockedResponse.status}`);
  });

  await run("DOCENTE | Cannot read out-of-scope student report", async () => {
    const response = await client
      .get(`/api/reports/student/${outScopeStudentDocument}/summary`)
      .set("Authorization", `Bearer ${docenteToken}`);

    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("DOCENTE | Cannot read out-of-scope exam attempts", async () => {
    const response = await client
      .get(`/api/attempts/exam/${outOfScopeExamId}`)
      .set("Authorization", `Bearer ${docenteToken}`);

    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("DOCENTE | Cannot access admin-only readiness report", async () => {
    const response = await client
      .get("/api/reports/questions/readiness")
      .set("Authorization", `Bearer ${docenteToken}`);

    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("DOCENTE | Cannot access admin-only files coverage report", async () => {
    const response = await client
      .get("/api/reports/files/coverage")
      .set("Authorization", `Bearer ${docenteToken}`);

    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("DOCENTE | Cannot upload files (ADMIN only)", async () => {
    const payload = Buffer.from(JSON.stringify({ test: "docente-upload-forbidden", runId }), "utf-8");
    const response = await client
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${docenteToken}`)
      .field("categoria", "SIMULACROS")
      .field("grado_objetivo", "11")
      .field("tipo_prueba", "Saber 11")
      .attach("file", payload, {
        filename: `docente_forbidden_${runId}.json`,
        contentType: "application/json"
      });

    ensure(response.status === 403, `status esperado 403, recibido ${response.status}`);
  });

  await run("StudentAuth | Login by document", async () => {
    const response = await client.post("/api/student-auth/login").send({
      tipo_identificacion: "TI",
      numero_identificacion: publicDocument
    });

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(typeof response.body?.data?.token === "string", "token estudiante no presente");
    studentToken = response.body.data.token;
  });

  await run("AdminSystem | ESTUDIANTE cannot access status", async () => {
    const response = await client.get("/api/admin/system/status").set("Authorization", `Bearer ${studentToken}`);
    ensure(response.status === 401, `status esperado 401, recibido ${response.status}`);
  });

  await run("StudentAuth | Login second student by document", async () => {
    const response = await client.post("/api/student-auth/login").send({
      tipo_identificacion: "TI",
      numero_identificacion: secondStudentDocument
    });

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(typeof response.body?.data?.token === "string", "token segundo estudiante no presente");
    secondStudentToken = response.body.data.token;
  });

  await run("StudentPortal | Home with student token", async () => {
    const response = await client.get("/api/student/home").set("Authorization", `Bearer ${studentToken}`);

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.student?.numeroIdentificacion === publicDocument, "home no corresponde al estudiante");
  });

  await run("Student token | Cannot access admin students route", async () => {
    const response = await client.get("/api/students").set("Authorization", `Bearer ${studentToken}`);
    ensure(response.status === 401, `status esperado 401, recibido ${response.status}`);
  });

  await run("StudentPortal | Home without student session fails", async () => {
    const response = await client.get("/api/student/home");
    ensure(response.status === 401, `status esperado 401, recibido ${response.status}`);
  });

  await run("StudentPortal | Start with student session", async () => {
    const response = await client
      .post("/api/student/attempts/start")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        prueba_id: createdExamId
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    ensure(response.body?.data?.attempt?.id, "attempt estudiante no generado");
    studentAttemptId = response.body?.data?.attempt?.id;
  });

  await run("StudentPortal | Answer own attempt", async () => {
    const response = await client
      .post(`/api/student/attempts/${studentAttemptId}/answer`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        pregunta_id: createdQuestionId,
        opcion_id_seleccionada: selectedOptionId
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
  });

  await run("StudentPortal | Answer own attempt updates instead of duplicate", async () => {
    const response = await client
      .post(`/api/student/attempts/${studentAttemptId}/answer`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        pregunta_id: createdQuestionId,
        opcion_id_seleccionada: alternateOptionId
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);

    const [count, answer] = await Promise.all([
      prisma.studentAnswer.count({
        where: {
          intentoId: studentAttemptId,
          preguntaId: createdQuestionId
        }
      }),
      prisma.studentAnswer.findFirst({
        where: {
          intentoId: studentAttemptId,
          preguntaId: createdQuestionId
        },
        select: {
          opcionIdSeleccionada: true
        }
      })
    ]);

    ensure(count === 1, `debe existir 1 respuesta por intento/pregunta, encontrado ${count}`);
    ensure(
      answer?.opcionIdSeleccionada === alternateOptionId,
      "la respuesta existente no se actualizo con la ultima opcion seleccionada"
    );
  });

  await run("StudentPortal | Submit own attempt", async () => {
    const response = await client
      .post(`/api/student/attempts/${studentAttemptId}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({});

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.porcentajeTotal >= 0, "porcentaje total no retornado en submit estudiante");
  });

  await run("StudentPortal | Cannot answer finalized attempt", async () => {
    const response = await client
      .post(`/api/student/attempts/${studentAttemptId}/answer`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        pregunta_id: createdQuestionId,
        opcion_id_seleccionada: selectedOptionId
      });

    ensure(response.status === 400, `status esperado 400, recibido ${response.status}`);
  });

  await run("StudentPortal | Authenticated student can read own attempt", async () => {
    const response = await client
      .get(`/api/student/attempts/${studentAttemptId}`)
      .set("Authorization", `Bearer ${studentToken}`);

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.attempt?.id === studentAttemptId, "detalle intento propio invalido");
  });

  await run("StudentPortal | Student cannot access other student's attempt", async () => {
    const response = await client
      .get(`/api/student/attempts/${studentAttemptId}`)
      .set("Authorization", `Bearer ${secondStudentToken}`);

    ensure(response.status === 404, `status esperado 404, recibido ${response.status}`);
  });

  await run("StudentPortal | Student cannot submit other student's attempt", async () => {
    const response = await client
      .post(`/api/student/attempts/${studentAttemptId}/submit`)
      .set("Authorization", `Bearer ${secondStudentToken}`)
      .send({});

    ensure(response.status === 404, `status esperado 404, recibido ${response.status}`);
  });

  await run("StudentPortal | Student can read own result by attempt", async () => {
    const response = await client
      .get(`/api/student/results/${studentAttemptId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({});

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.attemptId === studentAttemptId, "resultado propio invalido");
  });

  await run("StudentPortal | Student cannot read other student's result by attempt", async () => {
    const response = await client
      .get(`/api/student/results/${studentAttemptId}`)
      .set("Authorization", `Bearer ${secondStudentToken}`)
      .send({});

    ensure(response.status === 404, `status esperado 404, recibido ${response.status}`);
  });

  await run("Attempts | Legacy public route removed", async () => {
    const response = await client
      .post("/api/attempts/public/start")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ prueba_id: createdExamId });
    ensure([401, 404].includes(response.status), `status esperado 401|404, recibido ${response.status}`);
  });

  await run("Attempts | Answer question", async () => {
    const response = await client
      .post(`/api/attempts/${createdAttemptId}/answer`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        pregunta_id: createdQuestionId,
        opcion_id_seleccionada: selectedOptionId
      });

    ensure(response.status === 201, `status esperado 201, recibido ${response.status}`);
    ensure(response.body?.data?.esCorrecta === true, "respuesta no fue correcta");
  });

  await run("Attempts | Submit and auto-grade", async () => {
    const response = await client
      .post(`/api/attempts/${createdAttemptId}/submit`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.porcentajeTotal >= 0, "porcentajeTotal no calculado");
  });

  await run("Reports | Student summary", async () => {
    const response = await client
      .get(`/api/reports/student/${testDocument}/summary`)
      .set("Authorization", `Bearer ${adminToken}`);

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.totalAttempts >= 1, "summary no retorna intentos");
  });

  await run("Reports | Classroom summary", async () => {
    const response = await client
      .get("/api/reports/classroom/summary?grado=11")
      .set("Authorization", `Bearer ${adminToken}`);

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
    ensure(response.body?.data?.totals?.studentsWithAttempts >= 1, "classroom summary sin estudiantes");
  });

  await run("Files | Soft delete uploaded file", async () => {
    if (!createdFileId) {
      throw new Error("file id no disponible para soft delete");
    }

    const response = await client
      .delete(`/api/files/${createdFileId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    ensure(response.status === 200, `status esperado 200, recibido ${response.status}`);
  });

  printMatrix();

  const failed = results.filter((item) => item.status === "FAIL");
  if (failed.length > 0) {
    throw new Error(`Pruebas fallidas: ${failed.length}`);
  }
};

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Error no controlado";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
