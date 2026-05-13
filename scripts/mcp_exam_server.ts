import readline from "readline";
import { PrismaClient, QuestionGenerationStatus, QuestionSourceType, QuestionType } from "@prisma/client";

const prisma = new PrismaClient();

type JsonRpcRequest = {
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

const tools = [
  {
    name: "buscar_materiales",
    description: "Busca materiales y fuentes por texto libre",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        limit: { type: "number" }
      },
      required: ["q"]
    }
  },
  {
    name: "buscar_preguntas",
    description: "Busca preguntas por texto, area, materia o tema",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        area: { type: "string" },
        subject_code: { type: "string" },
        topic: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "obtener_pregunta_por_id",
    description: "Obtiene detalle de pregunta con opciones",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"]
    }
  },
  {
    name: "listar_temas",
    description: "Lista temas disponibles",
    inputSchema: {
      type: "object",
      properties: {
        subject_code: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "listar_bancos_preguntas",
    description: "Lista bancos/fuentes de preguntas detectados",
    inputSchema: {
      type: "object",
      properties: {
        source_type: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "obtener_contexto_para_generar_preguntas",
    description: "Devuelve contexto resumido de preguntas/fuentes para generacion IA",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string" },
        subject_code: { type: "string" },
        topic: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "validar_pregunta",
    description: "Valida pregunta generada y sugiere estado aprobar/corregir/rechazar",
    inputSchema: {
      type: "object",
      properties: {
        enunciado: { type: "string" },
        opciones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              texto_opcion: { type: "string" },
              es_correcta: { type: "boolean" }
            },
            required: ["texto_opcion", "es_correcta"]
          }
        },
        explicacion: { type: "string" },
        area: { type: "string" },
        subject_code: { type: "string" },
        difficulty: { type: "string" }
      },
      required: ["enunciado", "opciones"]
    }
  },
  {
    name: "guardar_generacion_ia",
    description: "Guarda registro de generacion IA",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        model: { type: "string" },
        prompt: { type: "string" },
        context: { type: "object" },
        raw_output: { type: "object" },
        validation: { type: "object" },
        status: { type: "string", description: "BORRADOR|GENERADA_IA|EN_REVISION|REVISADA|APROBADA|PUBLICADA|RECHAZADA|ARCHIVADA" },
        source_id: { type: "string" }
      },
      required: ["prompt"]
    }
  },
  {
    name: "crear_pregunta_generada",
    description: "Crea pregunta generada y la relaciona con un registro de generacion IA",
    inputSchema: {
      type: "object",
      properties: {
        generation_id: { type: "string" },
        codigo_interno: { type: "string" },
        enunciado: { type: "string" },
        area: { type: "string" },
        subject_code: { type: "string" },
        competencia: { type: "string" },
        componente: { type: "string" },
        nivel_dificultad: { type: "string" },
        nivel_cognitivo: { type: "string" },
        grado_objetivo: { type: "string" },
        explicacion_respuesta: { type: "string" },
        publish: { type: "boolean" },
        opciones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              texto_opcion: { type: "string" },
              es_correcta: { type: "boolean" }
            },
            required: ["texto_opcion", "es_correcta"]
          }
        }
      },
      required: ["enunciado", "area", "opciones"]
    }
  }
];

const send = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const ok = (id: string | number | null | undefined, result: Record<string, unknown>) => {
  send({
    jsonrpc: "2.0",
    id,
    result
  });
};

const fail = (id: string | number | null | undefined, code: number, message: string) => {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
};

const toGenerationStatus = (value: unknown) => {
  if (typeof value !== "string") {
    return QuestionGenerationStatus.BORRADOR;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "GENERADA_IA") return QuestionGenerationStatus.GENERADA_IA;
  if (normalized === "EN_REVISION") return QuestionGenerationStatus.EN_REVISION;
  if (normalized === "REVISADA") return QuestionGenerationStatus.REVISADA;
  if (normalized === "APROBADA") return QuestionGenerationStatus.APROBADA;
  if (normalized === "PUBLICADA") return QuestionGenerationStatus.PUBLICADA;
  if (normalized === "RECHAZADA") return QuestionGenerationStatus.RECHAZADA;
  if (normalized === "ARCHIVADA") return QuestionGenerationStatus.ARCHIVADA;
  return QuestionGenerationStatus.BORRADOR;
};

const runTool = async (name: string, args: Record<string, unknown>) => {
  const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 200);

  switch (name) {
    case "buscar_materiales": {
      const q = String(args.q ?? "").trim();
      const [sources, files] = await Promise.all([
        prisma.questionSource.findMany({
          where: {
            OR: [{ logicalPath: { contains: q, mode: "insensitive" } }, { originalFileName: { contains: q, mode: "insensitive" } }]
          },
          take: limit,
          orderBy: { createdAt: "desc" }
        }),
        prisma.fileAsset.findMany({
          where: {
            OR: [
              { nombreOriginal: { contains: q, mode: "insensitive" } },
              { descripcion: { contains: q, mode: "insensitive" } },
              { rutaLogica: { contains: q, mode: "insensitive" } }
            ]
          },
          take: limit,
          orderBy: { createdAt: "desc" }
        })
      ]);

      return { sources, files };
    }

    case "buscar_preguntas": {
      const q = typeof args.q === "string" ? args.q.trim() : undefined;
      const subjectCode = typeof args.subject_code === "string" ? args.subject_code.trim() : undefined;
      const topic = typeof args.topic === "string" ? args.topic.trim() : undefined;
      const area = typeof args.area === "string" ? args.area.trim().toUpperCase() : undefined;

      const rows = await prisma.question.findMany({
        where: {
          estado: true,
          area: area as any,
          subject: subjectCode ? { code: subjectCode } : undefined,
          enunciado: q ? { contains: q, mode: "insensitive" } : undefined,
          topicLinks: topic
            ? {
                some: {
                  topic: {
                    name: { contains: topic, mode: "insensitive" }
                  }
                }
              }
            : undefined
        },
        include: {
          subject: true,
          topicLinks: {
            include: { topic: true }
          },
          options: {
            where: { isArchived: false },
            orderBy: { orden: "asc" }
          }
        },
        take: limit,
        orderBy: { createdAt: "desc" }
      });

      return {
        total: rows.length,
        items: rows
      };
    }

    case "obtener_pregunta_por_id": {
      const id = String(args.id ?? "").trim();
      const row = await prisma.question.findUnique({
        where: { id },
        include: {
          subject: true,
          source: true,
          generation: true,
          topicLinks: {
            include: {
              topic: {
                include: {
                  subject: true
                }
              }
            }
          },
          options: {
            where: { isArchived: false },
            orderBy: { orden: "asc" }
          }
        }
      });
      return row ?? null;
    }

    case "listar_temas": {
      const subjectCode = typeof args.subject_code === "string" ? args.subject_code.trim() : undefined;
      const rows = await prisma.topic.findMany({
        where: {
          subject: subjectCode ? { code: subjectCode } : undefined,
          isActive: true
        },
        include: {
          subject: true
        },
        take: limit,
        orderBy: [{ subject: { code: "asc" } }, { name: "asc" }]
      });
      return {
        total: rows.length,
        items: rows
      };
    }

    case "listar_bancos_preguntas": {
      const sourceTypeRaw = typeof args.source_type === "string" ? args.source_type.trim().toUpperCase() : undefined;
      const sourceType =
        sourceTypeRaw && Object.values(QuestionSourceType).includes(sourceTypeRaw as QuestionSourceType)
          ? (sourceTypeRaw as QuestionSourceType)
          : undefined;

      const rows = await prisma.questionSource.findMany({
        where: { sourceType },
        include: {
          _count: {
            select: {
              questions: true
            }
          }
        },
        take: limit,
        orderBy: { createdAt: "desc" }
      });
      return {
        total: rows.length,
        items: rows
      };
    }

    case "obtener_contexto_para_generar_preguntas": {
      const area = typeof args.area === "string" ? args.area.trim().toUpperCase() : undefined;
      const subjectCode = typeof args.subject_code === "string" ? args.subject_code.trim() : undefined;
      const topic = typeof args.topic === "string" ? args.topic.trim() : undefined;

      const questions = await prisma.question.findMany({
        where: {
          estado: true,
          area: area as any,
          subject: subjectCode ? { code: subjectCode } : undefined,
          topicLinks: topic
            ? {
                some: {
                  topic: {
                    name: { contains: topic, mode: "insensitive" }
                  }
                }
              }
            : undefined
        },
        select: {
          id: true,
          area: true,
          enunciado: true,
          explicacionRespuesta: true,
          subject: {
            select: {
              code: true,
              name: true
            }
          },
          source: {
            select: {
              id: true,
              logicalPath: true,
              sourceType: true
            }
          },
          topicLinks: {
            select: {
              topic: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        take: limit,
        orderBy: { createdAt: "desc" }
      });

      return {
        total: questions.length,
        items: questions
      };
    }

    case "validar_pregunta": {
      const enunciado = String(args.enunciado ?? "").trim();
      const opciones = Array.isArray(args.opciones) ? args.opciones : [];
      const correctCount = opciones.filter((item) => Boolean((item as any)?.es_correcta)).length;
      const duplicate = await prisma.question.findFirst({
        where: {
          enunciado
        },
        select: {
          id: true
        }
      });

      const issues: string[] = [];
      if (enunciado.length < 12) issues.push("enunciado_demasiado_corto");
      if (opciones.length !== 4) issues.push("opciones_deben_ser_4");
      if (correctCount !== 1) issues.push("debe_existir_una_sola_respuesta_correcta");
      if (duplicate) issues.push("parece_duplicada_en_banco");

      const estadoSugerido = issues.length === 0 ? "aprobar" : issues.length <= 2 ? "corregir" : "rechazar";
      return {
        estadoSugerido,
        issues,
        duplicateQuestionId: duplicate?.id ?? null
      };
    }

    case "guardar_generacion_ia": {
      const prompt = String(args.prompt ?? "").trim();
      const created = await prisma.questionGeneration.create({
        data: {
          sourceId: typeof args.source_id === "string" ? args.source_id : undefined,
          provider: typeof args.provider === "string" ? args.provider : undefined,
          model: typeof args.model === "string" ? args.model : undefined,
          prompt,
          context: (args.context as any) ?? undefined,
          rawOutput: (args.raw_output as any) ?? undefined,
          validation: (args.validation as any) ?? undefined,
          status: toGenerationStatus(args.status)
        }
      });
      return created;
    }

    case "crear_pregunta_generada": {
      const options = Array.isArray(args.opciones) ? args.opciones : [];
      const correctCount = options.filter((item) => Boolean((item as any)?.es_correcta)).length;
      if (options.length < 2 || correctCount !== 1) {
        throw new Error("opciones invalidas: se requieren >=2 opciones y una sola correcta");
      }

      const generationId = typeof args.generation_id === "string" ? args.generation_id : undefined;
      const publish = Boolean(args.publish);
      const codeCandidate = typeof args.codigo_interno === "string" ? args.codigo_interno.trim() : "";
      const fallbackCode = `IA_${Date.now()}`;
      const codigoInterno = codeCandidate || fallbackCode;

      const question = await prisma.question.create({
        data: {
          codigoInterno,
          generation: generationId ? { connect: { id: generationId } } : undefined,
          isAiGenerated: true,
          area: String(args.area ?? "LECTURA_CRITICA").toUpperCase() as any,
          competencia: String(args.competencia ?? "GENERACION_IA"),
          componente: String(args.componente ?? "GENERAL"),
          nivelDificultad: String(args.nivel_dificultad ?? "MEDIO").toUpperCase() as any,
          nivelCognitivo: String(args.nivel_cognitivo ?? "ANALISIS"),
          enunciado: String(args.enunciado ?? ""),
          tipoPregunta: QuestionType.SELECCION_UNICA,
          gradoObjetivo: String(args.grado_objetivo ?? "11"),
          estado: publish,
          explicacionRespuesta: typeof args.explicacion_respuesta === "string" ? args.explicacion_respuesta : undefined,
          subject: typeof args.subject_code === "string" ? { connect: { code: args.subject_code } } : undefined,
          options: {
            create: options.map((option, index) => ({
              textoOpcion: String((option as any).texto_opcion ?? ""),
              esCorrecta: Boolean((option as any).es_correcta),
              orden: index + 1
            }))
          }
        },
        include: {
          options: {
            where: { isArchived: false },
            orderBy: { orden: "asc" }
          }
        }
      });

      if (generationId) {
        await prisma.questionGeneration.update({
          where: { id: generationId },
          data: {
            status: publish ? QuestionGenerationStatus.PUBLICADA : QuestionGenerationStatus.GENERADA_IA
          }
        });
      }

      return question;
    }

    default:
      throw new Error(`Tool no soportada: ${name}`);
  }
};

const handleRequest = async (request: JsonRpcRequest) => {
  if (request.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "examen-mcp",
        version: "1.0.0"
      },
      capabilities: {
        tools: {}
      }
    };
  }

  if (request.method === "tools/list") {
    return {
      tools
    };
  }

  if (request.method === "tools/call") {
    const name = String(request.params?.name ?? "");
    const args = (request.params?.arguments as Record<string, unknown>) ?? {};
    const result = await runTool(name, args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result)
        }
      ]
    };
  }

  if (request.method === "shutdown") {
    await prisma.$disconnect();
    return {};
  }

  throw new Error(`Metodo no soportado: ${request.method}`);
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", async (line) => {
  const text = line.trim();
  if (!text) {
    return;
  }

  let request: JsonRpcRequest;
  try {
    request = JSON.parse(text) as JsonRpcRequest;
  } catch {
    fail(null, -32700, "Parse error");
    return;
  }

  try {
    const result = await handleRequest(request);
    ok(request.id, result);
  } catch (error) {
    fail(request.id, -32000, error instanceof Error ? error.message : "Error interno");
  }
});

rl.on("close", async () => {
  await prisma.$disconnect();
});
