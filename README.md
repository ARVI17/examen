# Backend de Evaluacion Academica (Saber 11) + Gestion Documental

Backend modular en Node.js/Express/TypeScript para evaluaciones tipo Saber 11 y gestion de archivos academicos.
Incluye autenticacion, estudiantes, preguntas, examenes, intentos, reportes y modulo documental con versionado.

## Tecnologias

- Node.js
- Express
- TypeScript
- PostgreSQL
- Prisma ORM
- Multer
- Zod
- dotenv
- pino

## Funcionalidades incluidas

- Carga de archivos con validacion de MIME + extension + firma (magic bytes) y tamano maximo configurable.
- Almacenamiento fisico seguro en `storage/` con estructura por categoria/anio/grado/area/tipo.
- Registro de metadata en base de datos (`file_assets`).
- Listado con paginacion, filtros, busqueda y ordenamiento.
- Consulta por ID.
- Descarga segura por ID y por consulta logica.
- Actualizacion de metadata.
- Eliminacion logica (`activo=false` y `deletedAt`).
- Versionamiento (`/new-version`) por familia tecnica (`parentFileId`).
- Duplicacion (`/duplicate`) para reutilizacion sin contaminar la familia de versiones (`sourceFileId`).

## Estructura del proyecto

```txt
src/
  app.ts
  server.ts
  config/
    index.ts
  common/
    logger.ts
    prisma.ts
    errors/
      AppError.ts
    utils/
      api-response.ts
      audit.ts
      pagination.ts
      sanitize.ts
  middlewares/
    auth.middleware.ts
    error.middleware.ts
    rate-limit.middleware.ts
    sanitize.middleware.ts
    validation.middleware.ts
  modules/
    files/
      files.constants.ts
      files.controller.ts
      files.repository.ts
      files.routes.ts
      files.schema.ts
      files.service.ts
      files.types.ts
      files.upload.ts
      files.utils.ts
  routes/
    index.ts
  docs/
    openapi.ts
prisma/
  schema.prisma
storage/
  tmp/
  examenes/
  simulacros/
  bancos_preguntas/
  hojas_respuesta/
  claves/
  reportes/
  materiales_apoyo/
```

## Configuracion de entorno

Copia `.env.example` a `.env` y ajusta los valores.

```env
DATABASE_URL="postgresql://saber11:saber11password@localhost:5432/saber11db?schema=public"
PORT=4000
HOST="0.0.0.0"
PUBLIC_BASE_URL=""
PUBLIC_HOSTNAME=""
JWT_SECRET="change_this_secret"
JWT_EXPIRES_IN="8h"
CORS_ORIGINS="http://localhost:3000,http://localhost:5173"
CORS_ALLOW_PRIVATE_NETWORK="true"
TRUST_PROXY="false"
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
AUTH_RATE_LIMIT_WINDOW_MS=60000
AUTH_RATE_LIMIT_MAX_REQUESTS=20
AUTH_LOGIN_MAX_WRONG_BY_IP=50
AUTH_LOGIN_MAX_WRONG_BY_USER_IP=8
AUTH_LOGIN_BLOCK_DURATION_SECONDS=900
AUTH_CONTEXT_CACHE_TTL_SECONDS=0
STORAGE_ROOT="storage"
FILE_MAX_SIZE_MB=20
FILE_ALLOWED_MIME_TYPES="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,text/csv,image/png,image/jpeg"
FILE_ALLOWED_EXTENSIONS=".pdf,.doc,.docx,.xls,.xlsx,.json,.csv,.png,.jpg,.jpeg"

# Bootstrap inicial de admin (opcional/manual)
# BOOTSTRAP_ADMIN_EMAIL="admin@tu-dominio.com"
# BOOTSTRAP_ADMIN_PASSWORD="cambia-esta-clave-por-una-fuerte"
# BOOTSTRAP_ADMIN_NAME="Administrador"
```

## Instalacion y ejecucion

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run seed
npm run dev
```

## Docker

```bash
docker compose build
docker compose up -d
```

El contenedor API ejecuta migraciones con `prisma migrate deploy` al iniciar.
Para sembrar datos, usa un job/manual controlado:

```bash
docker compose exec api npm run seed
```

Si no quieres correr `seed` completo, puedes bootstrapear solo el primer admin:

```bash
docker compose exec -e BOOTSTRAP_ADMIN_EMAIL=admin@tu-dominio.com \
  -e BOOTSTRAP_ADMIN_PASSWORD='clave-super-segura-12+' \
  -e BOOTSTRAP_ADMIN_NAME='Administrador' \
  api npm run bootstrap:admin
```

Para registrar automaticamente los cuadernillos ICFES descargados en `file_assets`:

```bash
docker compose exec api npm run ingest:icfes:cuadernillos
```

Para registrar otro manifiesto (ej. examenes pasados):

```bash
docker compose exec api npm run ingest:icfes:cuadernillos -- --manifest=storage/bancos_preguntas/icfes/examenes_pasados/manifest_examenes_pasados.json
```

Para refrescar/descargar el paquete de examenes pasados oficiales:

```bash
npm run download:icfes:pasados
# o dentro del contenedor
docker compose exec api npm run download:icfes:pasados
```

Nota: si existe `manifest_examenes_saber11_2021_2025_consolidado.json`, el script lo usa como semilla de enlaces oficial.

Para extraer preguntas (enunciado/opciones/respuesta cuando exista) desde los cuadernillos PDF:

```bash
docker compose exec api npm run extract:icfes:questions
```

Para cargar esas preguntas extraidas en `question_bank`:

```bash
# Validacion sin escribir en DB
docker compose exec api npm run ingest:icfes:questions

# Escritura real en DB
docker compose exec api npm run ingest:icfes:questions -- --apply
```

Pipeline completo (extraer + cargar):

```bash
docker compose exec api npm run pipeline:icfes:questions
```

API:

- `http://localhost:4000`
- `http://localhost:4000/health`
- `http://localhost:4000/health/ready`
- `http://localhost:4000/connection-info`
- `http://localhost:4000/api/docs`

### Portal estudiante seguro (sin autorregistro)

- Login estudiante: `POST /api/student-auth/login` con `tipo_identificacion` y `numero_identificacion`.
- Sesion estudiante: `GET /api/student-auth/me`.
- Portal estudiante (requiere token de estudiante):
  - `GET /api/student/home`
  - `GET /api/student/exams`
  - `POST /api/student/attempts/start`
  - `GET /api/student/attempts/:id`
  - `POST /api/student/attempts/:id/answer`
  - `POST /api/student/attempts/:id/submit`
  - `GET /api/student/results`
- La vista web estudiante usa estas rutas en `http://localhost:4000/simulador`.
- Breaking change:
  - Las rutas `/api/attempts/public/*` fueron retiradas.
  - Usa exclusivamente `/api/student/*` con sesion de estudiante.

### Alcance docente por colegio/grupo

- El rol `DOCENTE` ahora requiere alcance explícito en backend (colegios/grupos asignados).
- Administración de alcance:
  - `GET /api/users/:id/scopes`
  - `PUT /api/users/:id/scopes` con `scope_school_ids` y/o `scope_group_ids`.
- Sin alcance configurado, el docente recibe `DOCENTE_SCOPE_NOT_CONFIGURED` en rutas protegidas.

### Operacion del sistema (solo ADMIN)

Panel web en `/admin` con seccion **Operacion del sistema** para ejecutar acciones predefinidas y auditadas, sin consola libre:

- Sub-seccion permanente: **Monitoreo del simulacro** (estado rapido, semaforo LAN, recordatorios antes/durante/despues y comandos solo copiable).

- `GET /api/admin/system/status`
- `GET /api/admin/system/lan`
- `GET /api/admin/system/health`
- `GET /api/admin/system/operations`
- `GET /api/admin/system/checklist`
- `POST /api/admin/system/checklist/:itemId`
- `POST /api/admin/system/schools/import/dry-run`
- `POST /api/admin/system/schools/import/apply`
- `POST /api/admin/system/backup`
- `POST /api/admin/system/local-production/prepare`

Protecciones:

- Autenticacion obligatoria.
- Rol `ADMIN` obligatorio (DOCENTE/ESTUDIANTE bloqueados).
- Confirmaciones exactas para acciones sensibles:
  - `IMPORTAR COLEGIOS COLOMBIA`
  - `PREPARAR PRODUCCION LOCAL`
- Dry-run y backup reciente requeridos antes de importacion real.
- `LOCAL_PRODUCTION_PREPARE=true` obligatorio para operaciones de alto riesgo en produccion local.
- Sin exposicion de secretos ni ejecucion de comandos arbitrarios.
- Los comandos visibles en UI no se ejecutan desde la plataforma; son referencia operativa.

### Nuevos comandos utiles (multi-colegio / ingesta / MCP)

```bash
# Ingesta unificada (dry-run)
npm run ingest:kb

# Ingesta unificada aplicando cambios en BD
npm run ingest:kb:apply

# Servidor MCP (stdio JSON-RPC)
npm run mcp:server

# Importador idempotente de colegios Colombia (dry-run)
npm run seed:colegios:colombia:dry

# Aplicar importador Colombia en BD
npm run seed:colegios:colombia

# Reset limpio solo local/staging (dry-run)
npm run db:reset:clean:dry

# Reset limpio solo local/staging (requiere confirmacion explicita)
npm run db:reset:clean

# Preparar entorno demo (dry-run)
npm run db:prepare:demo:dry

# Preparar entorno demo (opcional con lote IA controlado)
npm run db:prepare:demo -- --with-ai=true --ai-count=6

# Produccion local/LAN (dry-run de preparacion controlada)
npm run db:prepare:local-production:dry

# Produccion local/LAN (requiere backup + doble confirmacion)
LOCAL_PRODUCTION_PREPARE=true npm run db:prepare:local-production -- --backup-file=backup_YYYYMMDD_HHMMSS.sql --with-ai=true --ai-count=5
# PowerShell:
$env:LOCAL_PRODUCTION_PREPARE='true'; npm run db:prepare:local-production -- --backup-file=backup_YYYYMMDD_HHMMSS.sql --with-ai=true --ai-count=5

# Carga LAN controlada (solo lectura, sin mutaciones)
npm run test:lan-load
# En contenedor:
docker compose run --rm api npm run test:lan-load

# Backup PostgreSQL (archivo .sql.gz + manifest)
powershell -ExecutionPolicy Bypass -File .\scripts\db_backup.ps1

# Restore test del ultimo backup
powershell -ExecutionPolicy Bypass -File .\scripts\db_restore_test.ps1
```

Opciones utiles de ingesta para volumen alto:

```bash
# exigir mas evidencia antes de aceptar claves "inciertas"
npm run ingest:kb:apply -- --min-uncertain-key-answers=20

# desactivar OCR de imagenes de claves (si quieres solo tablas xls/xlsx/pdf/texto)
npm run ingest:kb:apply -- --no-ocr-keys-images
```

El log `storage/reportes/ingestion_kb_log.json` incluye metricas de clasificacion:
`keyFilesClassifiedAsKeyTable`, `keyFilesClassifiedAsStatement`, `keyFilesClassifiedAsUncertain`,
`keyFilesSkippedByClassification` y detalle por archivo en `keyClassifications`.

### Importacion colegios Colombia

- Fuentes soportadas:
  - Fuente nacional por defecto (Socrata/MEN): dataset `cfw5-qzt5` (`MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA`).
  - Datos Abiertos Colombia (API Socrata) alterna mediante `--dataset-id=<ID_DATASET>`.
  - CSV oficial/local con columnas equivalentes.
- Nota:
  - `c56g-ubd2` es util para Magdalena, pero es departamental y no debe usarse como default nacional.
- El script soporta dos modos:
  - `source=socrata` (descarga por API Socrata)
  - `source=csv` (archivo local CSV)
- Comandos:
  - Dry-run con Socrata:
    `npm run seed:colegios:colombia:dry`
  - Aplicar con Socrata:
    `npm run seed:colegios:colombia`
  - Aplicar en produccion local controlada:
    `LOCAL_PRODUCTION_PREPARE=true npm run seed:colegios:colombia -- --apply --confirm-local-production`
  - PowerShell:
    `$env:LOCAL_PRODUCTION_PREPARE='true'; npm run seed:colegios:colombia -- --apply --confirm-local-production`
  - Aplicar con dataset explicito:
    `npm run seed:colegios:colombia -- --dataset-id=cfw5-qzt5`
  - Aplicar desde CSV local:
    `npm run seed:colegios:colombia -- --source=csv --csv=storage/materiales_apoyo/colegios_colombia.csv`
  - Filtrar por departamento:
    `npm run seed:colegios:colombia -- --departamento=MAGDALENA`
  - Filtrar por municipio:
    `npm run seed:colegios:colombia -- --departamento=MAGDALENA --municipio=\"SANTA MARTA\"`
  - Buscar por texto:
    `npm run seed:colegios:colombia -- --departamento=MAGDALENA --search=PALOMINITO`
- Normalizacion aplicada:
  - Departamento en mayusculas
  - Municipio en mayusculas
  - Sector normalizado a `OFICIAL` o `NO OFICIAL`
  - Dedupe por codigo DANE cuando existe; si no, por llave compuesta
  - Etiqueta concatenada:
    - `DEPARTAMENTO / MUNICIPIO / COLEGIO / SECTOR`
    - `DEPARTAMENTO / MUNICIPIO / ESTABLECIMIENTO / SEDE / SECTOR` (si hay sede)
- Salida de auditoria:
  - `storage/reportes/seed_colombia_schools_log.json`
- Validacion de fuente:
  - Si la fuente no contiene `departamento` y `municipio`, el script aborta con error controlado.

### Reset de base de datos (seguro)

- `npm run db:reset:clean` ejecuta:
  - `prisma migrate reset --force --skip-seed`
  - `npm run seed`
  - `npm run seed:colegios:colombia`
- Protecciones incluidas:
  - Bloqueo en `NODE_ENV=production`, salvo modo controlado local/LAN con:
    - `LOCAL_PRODUCTION_PREPARE=true`
    - `--confirm-local-production-reset`
    - `--backup-file=<ruta_backup.sql>` existente
  - Bloqueo si `DATABASE_URL` no parece entorno local/dev (salvo override explicito para staging controlado)
  - Dry-run disponible (`npm run db:reset:clean:dry`)

### Preparacion desde cero en produccion local/LAN (este PC)

1. Crear backup obligatorio:
   - `pg_dump "$DATABASE_URL" > backup_YYYYMMDD_HHMMSS.sql`
2. Simular flujo:
   - `LOCAL_PRODUCTION_PREPARE=true npm run db:prepare:local-production:dry`
3. Ejecutar flujo controlado:
   - `LOCAL_PRODUCTION_PREPARE=true npm run db:prepare:local-production -- --backup-file=backup_YYYYMMDD_HHMMSS.sql --confirm-local-production-reset`
4. El flujo:
   - reset limpio controlado
   - seed base
   - importacion colegios Colombia
   - prisma generate
   - opcional lote IA no publicado (`--with-ai=true --ai-count=5`)

## Hardening de produccion aplicado

- Rotacion JWT:
  - `JWT_SECRETS="secreto_actual,secreto_anterior_1,secreto_anterior_2"`
  - El backend firma con el primer secreto y valida con toda la lista.
- Rate limit diferenciado:
  - `AUTH_*` para login/register
  - `PUBLIC_SIMULATOR_*` para flujo publico de simulador
  - `ADMIN_RATE_LIMIT_*` para rutas autenticadas administrativas
- Monitoreo y alertas:
  - `SLOW_REQUEST_WARN_MS` alerta en logs para requests lentas
  - `SLOW_QUERY_WARN_MS` alerta en logs para queries lentas de Prisma
  - `GET /health/ready` verifica conectividad real a DB
- Backups/restore:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\db_backup.ps1`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\db_restore_test.ps1`

## Acceso de estudiantes por IP local

Si estudiantes van a conectarse desde navegador en la red local:

1. Ejecuta el backend con `HOST=0.0.0.0`.
2. Obtén la IP LAN del equipo servidor (ejemplo: `192.168.1.20`).
3. Comparte esta URL base:
   - `http://192.168.1.20:4000`
4. Para que ellos confirmen la ruta correcta desde navegador, usa:
   - `http://192.168.1.20:4000/connection-info`
5. Alternativas para no depender de IP fija:
   - `PUBLIC_BASE_URL` (URL fija completa): `https://tudominio.com` o `http://192.168.1.20:4000`
   - `PUBLIC_HOSTNAME` (hostname estable): `saber11.local` o `mi-servidor`
6. Si hay frontend web local, agrega su origen a `CORS_ORIGINS` o usa `CORS_ALLOW_PRIVATE_NETWORK=true` en entorno controlado.
7. Abre el puerto `4000` en firewall de Windows para la red privada.

## Migraciones Prisma

Para entorno local:

```bash
npm run prisma:migrate
```

Para despliegue:

```bash
npm run prisma:migrate:deploy
```

## Estrategia de almacenamiento en `storage/`

Los archivos se reciben primero en `storage/tmp` y luego se mueven a ruta final:

```txt
storage/<categoria>/<anio>/grado_<grado>/area_<area>/tipo_<tipoPrueba>/<nombre_interno_unico>
```

Ejemplo:

```txt
storage/simulacros/2026/grado_11/area_matematicas/tipo_saber_11/1774926058173-uuid-archivo.json
```

Beneficios:

- evita colisiones de nombre;
- permite trazabilidad;
- facilita filtros y organizacion futura.

### Banco documental ICFES precargado (2021-2025)

Se dejo una base inicial en:

```txt
storage/bancos_preguntas/icfes/
  2021/
  2022/
  2023/
  2024/
  2025/
  manifest_icfes_2021_2025.json
```

El `manifest_icfes_2021_2025.json` contiene:

- anio
- nombre local del archivo
- URL de origen
- hash SHA-256
- tamano
- fecha de descarga

Adicionalmente, se incluye banco de cuadernillos de practica en:

```txt
storage/bancos_preguntas/icfes/cuadernillos/
  2024/
  2025/
  2026/
  manifest_cuadernillos_practica.json
  parsed/questions_dataset.json
```

Tambien se incluye coleccion de examenes/material historico disponible en:

```txt
storage/bancos_preguntas/icfes/examenes_pasados/
  2017/
  2021/
  2022/
  2023/
  2024/
  2025/
  2026/
  manifest_examenes_pasados.json
  manifest_examenes_saber11_2021_2025_consolidado.json
```

Auditorias de enlaces y cobertura (Saber 11):

```txt
storage/bancos_preguntas/icfes/audits/
  audit_links_2021_2025.json
  audit_links_2021_2025_saber11_only.json
  coverage_matrix_2021_2025_consolidado.json
  RESUMEN_AUDITORIA_2021_2025.md
```

## Endpoints principales API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/students`
- `GET /api/students`
- `POST /api/questions`
- `GET /api/questions`
- `POST /api/exams`
- `GET /api/exams`
- `POST /api/attempts/start`
- `GET /api/reports/dashboard/overview`
- `GET /api/reports/files/coverage` (**admin-only**)
- `GET /api/reports/files/coverage/export.csv` (**admin-only**)
- `GET /api/exams/public`
- `POST /api/exams/:id/assignments`
- `GET /api/exams/:id/assignments`
- `GET /api/questions/generated`
- `PATCH /api/questions/:id/ai-status`
- `GET /api/schools`
- `POST /api/schools`
- `POST /api/schools/:id/groups`
- `POST /api/students/bulk`
- `GET /api/students/bulk/template.csv`
- `POST /api/student/attempts/start` (oficial portal estudiante)
- `POST /api/student/attempts/:id/answer` (oficial portal estudiante)
- `POST /api/student/attempts/:id/submit` (oficial portal estudiante)
- `GET /api/student/attempts/:id` (oficial portal estudiante)
- `GET /api/student/results` (oficial portal estudiante)
- `POST /api/attempts/:id/session2/enable`
- `GET /api/attempts/pending-session2`
- `GET /api/reports/classroom/summary`
- `GET /api/reports/school/:schoolId/summary`
- `GET /api/reports/group/:groupId/summary`
- `GET /api/reports/questions/readiness` (**admin-only**)
- `GET /api/reports/files/material-local/coverage` (**admin-only**)
- `GET /api/reports/student/:numero_identificacion/performance`
- `GET /api/reports/student/:numero_identificacion/performance/export.csv`

## MCP para IA (preparado)

Script MCP por stdio: `scripts/mcp_exam_server.ts`

Herramientas disponibles:

- `buscar_materiales`
- `buscar_preguntas`
- `obtener_pregunta_por_id`
- `listar_temas`
- `listar_bancos_preguntas`
- `obtener_contexto_para_generar_preguntas`
- `validar_pregunta`
- `guardar_generacion_ia`
- `crear_pregunta_generada`

## Prueba real paso a paso

1. Ejecuta migraciones y seed:
   - `npm run prisma:migrate:deploy`
   - `npm run seed`
2. Crea colegio:
   - `POST /api/schools`
3. Crea grupo del colegio:
   - `POST /api/schools/:id/groups`
4. Carga estudiantes:
   - `POST /api/students/bulk` con CSV o `POST /api/students`
5. Carga base de conocimiento:
   - `npm run ingest:kb:apply`
6. Crea examen/simulacro:
   - `POST /api/exams`
   - `POST /api/exams/:id/questions`
7. Publica y asigna simulacro:
   - `PATCH /api/exams/:id` (`estado=PUBLICADO`)
   - `POST /api/exams/:id/assignments`
8. Estudiante inicia intento:
   - `POST /api/student/attempts/start`
   - `POST /api/student/attempts/:id/answer`
   - `POST /api/student/attempts/:id/submit`
9. Revisa resultados:
   - `GET /api/reports/student/:numero_identificacion/performance`
   - `GET /api/reports/classroom/summary`
   - `GET /api/reports/school/:schoolId/summary`

## Seguridad de registro

- `POST /api/auth/register` es **admin-only** (requiere JWT de usuario con rol `ADMIN`).
- El middleware `authenticate` revalida usuario activo y rol vigente en base de datos en cada request.
- `AUTH_CONTEXT_CACHE_TTL_SECONDS` controla cache opcional de contexto auth; por defecto `0` (sin cache, revocacion inmediata).

## Patrones de guardado para pruebas (`/api/exams`)

Para mantener datos consistentes, el modulo de pruebas aplica normalizacion y reglas de guardado:

- `tipo_prueba` permitido: `SIMULACRO | DIAGNOSTICO | EVALUACION | PRACTICA | SABER_11`.
- Se aceptan alias en entrada y se normalizan (ejemplo: `saber 11` -> `SABER_11`).
- `grado_objetivo` se normaliza a mayusculas y valida patron: `11`, `10A`, `9B`.
- Campos de texto (`nombre`, `descripcion`, `instrucciones`) se guardan con trim + colapso de espacios.
- No se permite crear dos pruebas activas con la misma llave natural:
  `nombre + tipo_prueba + grado_objetivo`.

Ejemplo de export CSV:

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:4000/api/reports/files/coverage/export.csv?year_from=2021&year_to=2025&only_saber11=true" \
  -o files_coverage.csv
```

## Endpoints del modulo Files

Lectura (`ADMIN|DOCENTE`):
- `GET /api/files`
- `GET /api/files/search`
- `GET /api/files/:id`
- `GET /api/files/:id/download`
- `GET /api/files/download`

Mutaciones (**admin-only**):
- `POST /api/files/upload`
- `PATCH /api/files/:id`
- `DELETE /api/files/:id`
- `POST /api/files/:id/new-version`
- `POST /api/files/:id/duplicate`

## Reglas de integridad nuevas

- `exams` tiene constraint unico por llave natural: `nombre + tipo_prueba + grado_objetivo + isDeleted`.
- `file_assets` tiene constraint unico para versionado por familia: `parentFileId + version`.
- Actualizacion de opciones en preguntas es transaccional y segura: no elimina historico, archiva opciones anteriores y crea nueva version activa de opciones.

## Filtros y ordenamiento en listado

`GET /api/files` y `GET /api/files/search` aceptan:

- `page`, `limit`
- `categoria`
- `grado_objetivo`
- `area`
- `tipo_prueba`
- `nombre`
- `activo`
- `include_deleted`
- `sort_by`: `created_at | updated_at | nombre_original`
- `sort_order`: `asc | desc`

## Ejemplos de uso

### 1) Subir archivo

```bash
curl -X POST "http://localhost:4000/api/files/upload" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@./ejemplo/simulacro-mate.pdf" \
  -F "categoria=SIMULACROS" \
  -F "grado_objetivo=11" \
  -F "area=MATEMATICAS" \
  -F "tipo_prueba=Saber 11" \
  -F "descripcion=Simulacro de matematicas"
```

### 2) Listar con filtros y orden

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:4000/api/files?categoria=SIMULACROS&sort_by=nombre_original&sort_order=asc&limit=20"
```

### 3) Crear nueva version

```bash
curl -X POST "http://localhost:4000/api/files/<FILE_ID>/new-version" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@./ejemplo/simulacro-mate-v2.pdf" \
  -F "descripcion=Version corregida"
```

### 4) Duplicar para reutilizacion

```bash
curl -X POST "http://localhost:4000/api/files/<FILE_ID>/duplicate" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre_original": "simulacro-reutilizado.pdf",
    "categoria": "SIMULACROS",
    "grado_objetivo": "11",
    "area": "MATEMATICAS",
    "tipo_prueba": "Saber 11"
  }'
```

## Formato de respuestas JSON

Exito:

```json
{
  "success": true,
  "message": "Archivo cargado",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Tipo de archivo no permitido",
  "error": {
    "code": "INVALID_FILE_TYPE",
    "details": {}
  }
}
```

## Pruebas automatizadas

Se incluye suite minima de integracion para `auth/files/attempts/reports`.

```bash
npm run test:integration
```

La suite valida:

- bloqueo de registro publico;
- login + registro admin-only;
- proteccion de files sin token;
- flujo base de intento (start/answer/submit);
- consulta de reportes.


