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
- `http://localhost:4000/connection-info`
- `http://localhost:4000/api/docs`

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
- `GET /api/reports/files/coverage`
- `GET /api/reports/files/coverage/export.csv`

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

## Endpoints del modulo Files (requieren JWT + rol `ADMIN|DOCENTE`)

- `POST /api/files/upload`
- `GET /api/files`
- `GET /api/files/search`
- `GET /api/files/:id`
- `GET /api/files/:id/download`
- `GET /api/files/download`
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


