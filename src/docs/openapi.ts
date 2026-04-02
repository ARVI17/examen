const bearerSecurity = [{ bearerAuth: [] }];

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Saber11 Backend API",
    version: "1.2.0",
    description:
      "API REST para gestion de evaluacion academica (auth, estudiantes, preguntas, examenes, intentos, reportes) y modulo documental."
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
        summary: "Cobertura documental por anio/tipo/categoria",
        security: bearerSecurity
      }
    },
    "/api/reports/files/coverage/export.csv": {
      get: {
        tags: ["Reports"],
        summary: "Exportar cobertura documental CSV",
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
        summary: "Subir archivo y registrar metadata",
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
        summary: "Actualizar metadata",
        security: bearerSecurity
      },
      delete: {
        tags: ["Files"],
        summary: "Eliminar logicamente",
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
        summary: "Crear nueva version desde archivo base",
        security: bearerSecurity
      }
    },
    "/api/files/{id}/duplicate": {
      post: {
        tags: ["Files"],
        summary: "Duplicar archivo para reutilizacion",
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
    { name: "Performance Levels" },
    { name: "Files" }
  ]
} as const;
