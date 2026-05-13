# Release Checklist (Produccion)

## 1) Pre-deploy
- Verificar rama y estado limpio:
  - `git status --short`
  - `git branch --show-current`
- Confirmar backup disponible antes de migraciones.
- Confirmar variables de entorno de produccion configuradas (sin usar valores de ejemplo).

## 2) Variables requeridas (sin valores)

### Obligatorias
- `DATABASE_URL`
- `PORT`
- `HOST`
- `JWT_SECRET` o `JWT_SECRETS`
- `JWT_EXPIRES_IN`
- `CORS_ORIGINS`
- `NODE_ENV`

### Sensibles
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_SECRETS`
- `BACKUP_DB_PASSWORD`
- `AI_API_KEY` (si aplica)
- Credenciales de `BACKUP_DB_*`

### Opcionales / operativas
- `PUBLIC_BASE_URL`
- `PUBLIC_HOSTNAME`
- `TRUST_PROXY`
- `CORS_ALLOW_PRIVATE_NETWORK`
- `RATE_LIMIT_*`
- `AUTH_RATE_LIMIT_*`
- `ADMIN_RATE_LIMIT_*`
- `AUTH_LOGIN_*`
- `STORAGE_ROOT`
- `FILE_MAX_SIZE_MB`
- `FILE_ALLOWED_MIME_TYPES`
- `FILE_ALLOWED_EXTENSIONS`
- `SLOW_REQUEST_WARN_MS`
- `SLOW_QUERY_WARN_MS`
- `AI_PROVIDER`
- `AI_BASE_URL`
- `OLLAMA_*`
- `BACKUP_DIR`
- `BACKUP_DB_*`

## 3) Build y migraciones (servicios reales)
- Servicios compose detectados: `db`, `ollama`, `api`
- Construir API:
  - `docker compose build api`
- Validar/generar Prisma:
  - `docker compose run --rm api npx prisma validate`
  - `docker compose run --rm api npx prisma generate`
- Aplicar migraciones en produccion (sin reset):
  - `docker compose run --rm api npx prisma migrate deploy`

## 4) Despliegue recomendado
1. `git status --short`
2. `git pull origin main`
3. `docker compose build api`
4. `docker compose run --rm api npx prisma migrate deploy`
5. `docker compose up -d`
6. `docker compose ps`
7. `docker compose logs -f api --tail=100`

## 5) Healthcheck y verificacion rapida
- Salud basica API:
  - `curl http://localhost:4000/health`
- Readiness con DB:
  - `curl http://localhost:4000/health/ready`

## 6) Backup previo (plantillas)
- Con URL:
  - `pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql`
- Desde compose (ajustar usuario/DB reales):
  - `docker compose exec db pg_dump -U <DB_USER> -d <DB_NAME> > backup_$(date +%Y%m%d_%H%M%S).sql`

## 7) Smoke test manual post-deploy

### ADMIN
- Iniciar sesion en `/admin`
- Verificar dashboard/KPIs/reportes/tablas
- Revisar listado de preguntas IA y cambio de estado
- Confirmar ausencia de errores en consola

### DOCENTE
- Iniciar sesion docente
- Verificar que solo vea colegios/grupos/estudiantes autorizados
- Confirmar que no vea datos globales de otros colegios

### ESTUDIANTE
- Iniciar sesion en `/simulador`
- Iniciar prueba, responder, navegar y finalizar
- Verificar resultado propio
- Confirmar bloqueo de acceso a datos no propios

### API / Infra
- Confirmar `200` en `/health` y `/health/ready`
- Revisar logs API sin errores 500
- Confirmar conectividad a DB

## 8) Rollback basico (no destructivo)

### Escenario A: fallo de app sin migracion critica
1. `git log --oneline -8`
2. `git checkout <COMMIT_ESTABLE>`
3. `docker compose build api`
4. `docker compose up -d`
5. `docker compose logs -f api --tail=100`

### Escenario B: fallo posterior a migracion
- No usar `prisma migrate reset` ni `prisma db push` en produccion.
- Restaurar backup solo con decision explicita.
- Preferir migracion correctiva para preservar datos en uso.

### Escenario C: fallo visual frontend
- Volver a commit UI estable
- Rebuild de `api`
- `docker compose up -d`
- Smoke test corto en `/admin` y `/simulador`

## 9) Prohibiciones operativas
- No ejecutar `prisma migrate reset` en produccion.
- No ejecutar seeds reales sin ventana controlada.
- No usar secretos de ejemplo en `docker-compose.yml`.
- No exponer `.env` en logs o commits.
