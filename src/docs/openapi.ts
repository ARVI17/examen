const bearerSecurity = [{ bearerAuth: [] }];

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Saber11 Backend API",
    version: "1.2.0",
    description:
      "API REST para gestion de evaluacion academica (auth, estudiantes, preguntas, examenes, intentos, reportes) y modulo documental. Breaking change: las rutas /api/attempts/public/* fueron retiradas; usar /api/student/* con sesion de estudiante."
  },
  servers: [{ url: "http://localhost:4000", description: "Local" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  paths: {
    "/": {
      get: {
        tags: ["System"],
        summary: "Estado basico del servicio"
      }
    },
    "/health": {
      get: {
        tags: ["System"],
        summary: "Healthcheck"
      }
    },
    "/health/ready": {
      get: {
        tags: ["System"],
        summary: "Readiness check con verificacion de base de datos"
      }
    },
    "/connection-info": {
      get: {
        tags: ["System"],
        summary: "Informacion de conexion local/LAN para frontends"
      }
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login de usuario"
      }
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Registrar usuario (solo ADMIN)",
        security: bearerSecurity
      }
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Usuario autenticado actual",
        security: bearerSecurity
      }
    },
    "/api/student-auth/login": {
      post: {
        tags: ["StudentAuth"],
        summary: "Login de estudiante por tipo y numero de identificacion"
      }
    },
    "/api/student-auth/me": {
      get: {
        tags: ["StudentAuth"],
        summary: "Sesion de estudiante actual",
        security: bearerSecurity
      }
    },
    "/api/students": {
      post: {
        tags: ["Students"],
        summary: "Crear estudiante",
        security: bearerSecurity
      },
      get: {
        tags: ["Students"],
        summary: "Listar estudiantes con filtros/paginacion",
        security: bearerSecurity
      }
    },
    "/api/students/{id}": {
      get: {
        tags: ["Students"],
        summary: "Obtener estudiante por ID",
        security: bearerSecurity
      },
      patch: {
        tags: ["Students"],
        summary: "Actualizar estudiante",
        security: bearerSecurity
      },
      delete: {
        tags: ["Students"],
        summary: "Borrado logico de estudiante",
        security: bearerSecurity
      }
    },
    "/api/students/{id}/history": {
      get: {
        tags: ["Students"],
        summary: "Historial por ID",
        security: bearerSecurity
      }
    },
    "/api/students/document/{numero_identificacion}": {
      get: {
        tags: ["Students"],
        summary: "Obtener estudiante por documento",
        security: bearerSecurity
      }
    },
    "/api/students/document/{numero_identificacion}/history": {
      get: {
        tags: ["Students"],
        summary: "Historial por documento",
        security: bearerSecurity
      }
    },
    "/api/questions": {
      post: {
        tags: ["Questions"],
        summary: "Crear pregunta",
        security: bearerSecurity
      },
      get: {
        tags: ["Questions"],
        summary: "Listar preguntas con filtros/paginacion",
        security: bearerSecurity
      }
    },
    "/api/questions/generated": {
      get: {
        tags: ["Questions"],
        summary: "Listar preguntas generadas por IA",
        security: bearerSecurity
      }
    },
    "/api/questions/{id}": {
      get: {
        tags: ["Questions"],
        summary: "Detalle de pregunta",
        security: bearerSecurity
      },
      patch: {
        tags: ["Questions"],
        summary: "Actualizar pregunta",
        security: bearerSecurity
      },
      delete: {
        tags: ["Questions"],
        summary: "Desactivar pregunta",
        security: bearerSecurity
      }
    },
    "/api/questions/{id}/ai-status": {
      patch: {
        tags: ["Questions"],
        summary: "Aprobar/Rechazar estado de generacion IA",
        security: bearerSecurity
      }
    },
    "/api/exams": {
      post: {
        tags: ["Exams"],
        summary: "Crear examen/simulacro",
        security: bearerSecurity
      },
      get: {
        tags: ["Exams"],
        summary: "Listar examenes",
        security: bearerSecurity
      }
    },
    "/api/exams/public": {
      get: {
        tags: ["Exams"],
        summary: "Listar examenes publicos disponibles"
      }
    },
    "/api/exams/{id}": {
      get: {
        tags: ["Exams"],
        summary: "Detalle de examen",
        security: bearerSecurity
      },
      patch: {
        tags: ["Exams"],
        summary: "Actualizar examen",
        security: bearerSecurity
      },
      delete: {
        tags: ["Exams"],
        summary: "Borrado logico de examen",
        security: bearerSecurity
      }
    },
    "/api/exams/{id}/questions": {
      post: {
        tags: ["Exams"],
        summary: "Asignar preguntas al examen",
        security: bearerSecurity
      },
      get: {
        tags: ["Exams"],
        summary: "Listar preguntas de examen",
        security: bearerSecurity
      }
    },
    "/api/exams/{id}/assignments": {
      post: {
        tags: ["Exams"],
        summary: "Crear asignacion de examen (GLOBAL/SCHOOL/GROUP/STUDENT)",
        security: bearerSecurity
      },
      get: {
        tags: ["Exams"],
        summary: "Listar asignaciones de examen",
        security: bearerSecurity
      }
    },
    "/api/attempts/start": {
      post: {
        tags: ["Attempts"],
        summary: "Iniciar intento",
        security: bearerSecurity
      }
    },
    "/api/attempts/{id}/answer": {
      post: {
        tags: ["Attempts"],
        summary: "Registrar/actualizar respuesta",
        security: bearerSecurity
      }
    },
    "/api/attempts/{id}/submit": {
      post: {
        tags: ["Attempts"],
        summary: "Enviar y calificar intento",
        security: bearerSecurity
      }
    },
    "/api/attempts/{id}/session2/enable": {
      post: {
        tags: ["Attempts"],
        summary: "Habilitar jornada 2 en intento estricto",
        security: bearerSecurity
      }
    },
    "/api/attempts/{id}": {
      get: {
        tags: ["Attempts"],
        summary: "Detalle de intento",
        security: bearerSecurity
      }
    },
    "/api/attempts/student/{numero_identificacion}": {
      get: {
        tags: ["Attempts"],
        summary: "Intentos por estudiante",
        security: bearerSecurity
      }
    },
    "/api/attempts/exam/{examId}": {
      get: {
        tags: ["Attempts"],
        summary: "Intentos por examen",
        security: bearerSecurity
      }
    },
    "/api/student/home": {
      get: {
        tags: ["StudentPortal"],
        summary: "Inicio del portal estudiante (ruta oficial)",
        security: bearerSecurity
      }
    },
    "/api/student/exams": {
      get: {
        tags: ["StudentPortal"],
        summary: "Pruebas disponibles para el estudiante",
        security: bearerSecurity
      }
    },
    "/api/student/attempts/start": {
      post: {
        tags: ["StudentPortal"],
        summary: "Iniciar intento para estudiante autenticado",
        security: bearerSecurity
      }
    },
    "/api/student/attempts/{id}": {
      get: {
        tags: ["StudentPortal"],
        summary: "Detalle de intento del estudiante",
        security: bearerSecurity
      }
    },
    "/api/student/attempts/{id}/answer": {
      post: {
        tags: ["StudentPortal"],
        summary: "Responder pregunta en intento propio",
        security: bearerSecurity
      }
    },
    "/api/student/attempts/{id}/submit": {
      post: {
        tags: ["StudentPortal"],
        summary: "Enviar intento propio",
        security: bearerSecurity
      }
    },
    "/api/student/attempts/{id}/session1/complete": {
      post: {
        tags: ["StudentPortal"],
        summary: "Completar sesion 1 y esperar sesion 2",
        security: bearerSecurity
      }
    },
    "/api/student/results": {
      get: {
        tags: ["StudentPortal"],
        summary: "Historial de resultados propios",
        security: bearerSecurity
      }
    },
    "/api/student/results/{id}": {
      get: {
        tags: ["StudentPortal"],
        summary: "Resultado propio por intento",
        security: bearerSecurity
      }
    },
    "/api/schools": {
      get: {
        tags: ["Schools"],
        summary: "Listar colegios",
        security: bearerSecurity
      },
      post: {
        tags: ["Schools"],
        summary: "Crear colegio",
        security: bearerSecurity
      }
    },
    "/api/schools/{id}/groups": {
      get: {
        tags: ["Schools"],
        summary: "Listar grupos por colegio",
        security: bearerSecurity
      },
      post: {
        tags: ["Schools"],
        summary: "Crear grupo en colegio",
        security: bearerSecurity
      }
    },
    "/api/reports/student/{numero_identificacion}/summary": {
      get: {
        tags: ["Reports"],
        summary: "Resumen global de estudiante",
        security: bearerSecurity
      }
    },
    "/api/reports/student/{numero_identificacion}/areas": {
      get: {
        tags: ["Reports"],
        summary: "Resultados por area de estudiante",
        security: bearerSecurity
      }
    },
    "/api/reports/student/{numero_identificacion}/performance": {
      get: {
        tags: ["Reports"],
        summary: "Reporte de desempeno del estudiante",
        security: bearerSecurity
      }
    },
    "/api/reports/classroom/summary": {
      get: {
        tags: ["Reports"],
        summary: "Resumen consolidado por aula",
        security: bearerSecurity
      }
    },
    "/api/reports/questions/readiness": {
      get: {
        tags: ["Reports"],
        summary: "Cobertura de banco por area (admin-only)",
        security: bearerSecurity
      }
    },
    "/api/reports/exam/{examId}/summary": {
      get: {
        tags: ["Reports"],
        summary: "Resumen de examen",
        security: bearerSecurity
      }
    },
    "/api/reports/exam/{examId}/ranking": {
      get: {
        tags: ["Reports"],
        summary: "Ranking de examen",
        security: bearerSecurity
      }
    },
    "/api/reports/dashboard/overview": {
      get: {
        tags: ["Reports"],
        summary: "Resumen dashboard",
        security: bearerSecurity
      }
    },
    "/api/reports/files/coverage": {
      get: {
        tags: ["Reports"],
        summary: "Cobertura documental por anio/tipo/categoria (admin-only)",
        security: bearerSecurity
      }
    },
    "/api/reports/files/coverage/export.csv": {
      get: {
        tags: ["Reports"],
        summary: "Exportar cobertura documental CSV (admin-only)",
        security: bearerSecurity
      }
    },
    "/api/performance-levels": {
      post: {
        tags: ["Performance Levels"],
        summary: "Crear nivel de desempeno",
        security: bearerSecurity
      },
      get: {
        tags: ["Performance Levels"],
        summary: "Listar niveles de desempeno",
        security: bearerSecurity
      }
    },
    "/api/performance-levels/{id}": {
      patch: {
        tags: ["Performance Levels"],
        summary: "Actualizar nivel de desempeno",
        security: bearerSecurity
      }
    },
    "/api/files/upload": {
      post: {
        tags: ["Files"],
        summary: "Subir archivo y registrar metadata (admin-only)",
        security: bearerSecurity
      }
    },
    "/api/files": {
      get: {
        tags: ["Files"],
        summary: "Listar archivos con filtros y paginacion",
        security: bearerSecurity
      }
    },
    "/api/files/search": {
      get: {
        tags: ["Files"],
        summary: "Buscar archivos por texto y filtros",
        security: bearerSecurity
      }
    },
    "/api/files/download": {
      get: {
        tags: ["Files"],
        summary: "Descargar por nombre/categoria/ruta logica",
        security: bearerSecurity
      }
    },
    "/api/files/{id}": {
      get: {
        tags: ["Files"],
        summary: "Consultar detalle por ID",
        security: bearerSecurity
      },
      patch: {
        tags: ["Files"],
        summary: "Actualizar metadata (admin-only)",
        security: bearerSecurity
      },
      delete: {
        tags: ["Files"],
        summary: "Eliminar logicamente (admin-only)",
        security: bearerSecurity
      }
    },
    "/api/files/{id}/download": {
      get: {
        tags: ["Files"],
        summary: "Descargar archivo por ID",
        security: bearerSecurity
      }
    },
    "/api/files/{id}/new-version": {
      post: {
        tags: ["Files"],
        summary: "Crear nueva version desde archivo base (admin-only)",
        security: bearerSecurity
      }
    },
    "/api/files/{id}/duplicate": {
      post: {
        tags: ["Files"],
        summary: "Duplicar archivo para reutilizacion (admin-only)",
        security: bearerSecurity
      }
    }
  },
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Students" },
    { name: "Questions" },
    { name: "Exams" },
    { name: "Attempts" },
    { name: "Reports" },
    { name: "Schools" },
    { name: "Performance Levels" },
    { name: "Files" }
  ]
} as const;
