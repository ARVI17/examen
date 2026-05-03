# Auditoria tecnica profunda: simulador + IA

## Fecha
- 2026-04-12

## Estado del sistema (actual)
- API compilada y desplegada en Docker (`api` + `db`).
- Endpoint nuevo validado: `GET /api/reports/questions/readiness`.
- Pipeline documental ejecutado para IA sobre material local.

## Hallazgos de cobertura de banco de preguntas (grado 11)
- Total actual: 10 preguntas.
- Meta sugerida de trabajo: 120 por area (600 total).
- Cobertura global: 1.67%.
- Brecha total: 590 preguntas.
- Mayor deficit: `LECTURA_CRITICA`, `SOCIALES_CIUDADANAS`, `CIENCIAS_NATURALES`, `INGLES`.

## Hallazgos de corpus IA (ejecucion real)
- Archivos seleccionados: 60.
- Archivos con extraccion util: 56.
- Chunks generados: 1756.
- Chunks unicos (sin duplicados): 1756.
- Distribucion por area:
  - SOCIALES_CIUDADANAS: 913
  - MATEMATICAS: 292
  - LECTURA_CRITICA: 257
  - CIENCIAS_NATURALES: 254
  - MULTI_AREA: 40

## Mejoras implementadas
1. Script de corpus IA:
   - `scripts/build_simulator_corpus.ts`
   - Extrae texto de `PDF/DOCX/TXT/CSV/JSON`.
   - Trocea en chunks con overlap.
   - Elimina duplicados por hash de texto normalizado.
2. Script de generacion IA:
   - `scripts/generate_simulator_questions_ai.ts`
   - Soporta modo `--preview` (sin costo API).
   - Genera en JSON estricto para ingestar a `question_bank`.
   - Soporta `--apply` con control de duplicado por enunciado/area/grado.
3. Endpoint de readiness:
   - `GET /api/reports/questions/readiness`
   - Mide cobertura por area y por dificultad.
   - Entrega brechas priorizadas para plan de carga.

## Riesgos detectados y control
- Riesgo: sesgo de corpus hacia Sociales.
  - Control: seleccion balanceada por area en el prompt pack.
- Riesgo: OCR insuficiente en imagenes sueltas.
  - Control: pendiente fase OCR para PNG/JPG.
- Riesgo: bajo volumen de banco actual.
  - Control: pipeline IA + carga progresiva y validacion docente.

## Ruta operativa recomendada
1. Ejecutar corpus completo:
   - `npm run build:simulator:corpus`
2. Generar preview por area:
   - `npm run generate:simulator:questions:ai -- --preview --areas=LECTURA_CRITICA,MATEMATICAS,SOCIALES_CIUDADANAS,CIENCIAS_NATURALES,INGLES --count=50 --chunks=20`
3. Generar con IA real:
   - `npm run generate:simulator:questions:ai -- --areas=... --count=50 --chunks=20`
4. Insertar en banco:
   - `npm run generate:simulator:questions:ai -- --areas=... --count=50 --chunks=20 --apply`
5. Medir avance:
   - `GET /api/reports/questions/readiness?grado_objetivo=11&target_per_area=120`
