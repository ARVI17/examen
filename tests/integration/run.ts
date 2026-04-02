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

  let adminToken = "";
  let createdQuestionId = "";
  let createdExamId = "";
  let createdAttemptId = "";
  let createdFileId = "";
  let selectedOptionId = "";
  const testDocument = `IT-${runId}`;
  const testEmail = `it.docente.${runId}@saber11.local`;

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
