# Project Continuity Guide

## Estado consolidado (hasta `88adc39`)
- `343f4b1`: hardening IA, importador Magdalena, reset seguro base.
- `40a955e`: UI admin/docente responsive + simulador enfocado + revision IA.
- `5f1a052`: checklist de release para despliegue.
- `88294ac`: manejo JSON malformado retorna `400 INVALID_JSON`.
- `3dea137`: catalogo nacional de colegios + endpoints departamento/municipio.
- `42633f4`: selectores encadenados departamento/municipio/colegio en admin.
- `63bc7d5`: guia de continuidad y flujos de catalogo Colombia.
- `88adc39`: fuente nacional por defecto `cfw5-qzt5` validada.
- `30d8f88` + `2997d16` + `4dd9903`: operacion del sistema segura desde admin (backend/UI/docs).
- `HEAD`: centro de monitoreo LAN permanente en Operacion del sistema (recordatorios + semaforo + guia operativa).

## Errores cerrados
- Ruta legacy `/api/attempts/public/*` retirada del flujo activo del portal estudiante.
- `PATCH /api/questions/:id/ai-status` con JSON invalido ya no responde `500`.
- Permisos backend reforzados:
  - `ADMIN` alcance global.
  - `DOCENTE` filtrado por scope backend/API.
  - `ESTUDIANTE` aislado a `/api/student/*`.

## Operacion administrada desde plataforma (ADMIN)
- Nueva seccion en `/admin`: **Operacion del sistema**.
- Sub-seccion fija: **Monitoreo del simulacro**.
- Backend dedicado: `src/modules/admin-system/*`.
- Endpoints protegidos con `authenticate + authorize(RoleCode.ADMIN)`.
- Controles sensibles:
  - `schools/import/apply` requiere dry-run reciente + backup reciente + confirmacion exacta.
  - `local-production/prepare` requiere confirmacion exacta + aceptacion de riesgo + `LOCAL_PRODUCTION_PREPARE=true`.
- Auditoria reutiliza `audit_logs` existente (`entidad=admin_system`).
- Sin terminal web y sin comandos arbitrarios.
- Los comandos en UI son solo texto copiable, nunca ejecutables desde navegador.

## Comandos seguros (operacion diaria)
- Build API: `docker compose build api`
- Levantar servicios: `docker compose up -d`
- Health: `curl -f http://localhost:4000/health`
- Ready: `curl -f http://localhost:4000/health/ready`
- Prisma validate: `docker compose run --rm api npx prisma validate`
- Prisma generate: `docker compose run --rm api npx prisma generate`
- Build TS: `docker compose run --rm api npm run build`
- Integracion: `docker compose run --rm api npm run test:integration`
- Carga LAN controlada: `docker compose run --rm api npm run test:lan-load`

## Comandos prohibidos en produccion
- `npx prisma migrate reset`
- `npm run db:reset:dev`
- `npm run db:reset:clean`
- `npm run db:prepare:demo`
- `npm run db:prepare:local-production` sin backup y sin confirmacion explicita
- Seeds/import masivos sin backup ni ventana controlada
- Publicar preguntas IA en lote sin revision humana

## Reset limpio (solo local/staging/demo)
1. Dry-run: `npm run db:reset:clean:dry`
2. Aplicar: `npm run db:reset:clean`
3. Preparacion demo (dry): `npm run db:prepare:demo:dry`
4. Preparacion demo (apply): `npm run db:prepare:demo -- --with-ai=true --ai-count=6`

Protecciones:
- Bloqueo en `NODE_ENV=production`.
- Bloqueo por `DATABASE_URL` no local (excepto override explicito en staging controlado).

## Produccion local/LAN: preparacion controlada (este PC)
1. Crear backup SQL antes de cualquier limpieza.
2. Definir `LOCAL_PRODUCTION_PREPARE=true` solo para la ejecucion controlada.
3. Dry-run:
   - `npm run db:prepare:local-production:dry`
4. Apply:
   - `npm run db:prepare:local-production -- --backup-file=backup_YYYYMMDD_HHMMSS.sql --confirm-local-production-reset`
5. Seguridad aplicada:
   - Requiere `NODE_ENV=production`
   - Requiere `LOCAL_PRODUCTION_PREPARE=true`
   - Requiere backup existente (`--backup-file`)
   - Doble confirmacion de reset local

## Importacion colegios Colombia
- Dataset nacional por defecto:
  - `cfw5-qzt5` (MEN, nacional, con departamento/municipio/sector/codigo DANE).
- Dataset departamental historico:
  - `c56g-ubd2` (Magdalena). No usar como default nacional.
- Dry-run: `npm run seed:colegios:colombia:dry`
- Apply: `npm run seed:colegios:colombia`
- Apply en production local controlada:
  - `LOCAL_PRODUCTION_PREPARE=true npm run seed:colegios:colombia -- --apply --confirm-local-production`
- Por departamento: `npm run seed:colegios:colombia -- --departamento=MAGDALENA`
- Por municipio: `npm run seed:colegios:colombia -- --departamento=MAGDALENA --municipio=\"SANTA MARTA\"`
- Por busqueda: `npm run seed:colegios:colombia -- --departamento=MAGDALENA --search=PALOMINITO`
- Desde CSV: `npm run seed:colegios:colombia -- --source=csv --csv=storage/materiales_apoyo/colegios_colombia.csv`

Validacion de fuente:
- El importador falla de forma controlada si la fuente no trae `departamento` y `municipio`.

Etiqueta de busqueda:
- `DEPARTAMENTO / MUNICIPIO / COLEGIO / SECTOR`
- `DEPARTAMENTO / MUNICIPIO / ESTABLECIMIENTO / SEDE / SECTOR`

## Preguntas IA demo (controlado)
- Generar lote pequeno no publicado:
  - `npx ts-node scripts/generate_simulator_questions_ai.ts --apply --publish=false --count=6`
- Estados esperados tras generacion:
  - `GENERADA_IA` o `EN_REVISION`
- Publicacion siempre manual desde admin.

## Smoke test minimo
### ADMIN
- Login `/admin`.
- KPIs + reportes.
- Revision IA (`/api/questions/generated`, `PATCH /api/questions/:id/ai-status`).

### DOCENTE
- Login y verificacion de scope.
- Reportes solo de colegios/grupos asignados.

### ESTUDIANTE
- Login `/simulador`.
- Iniciar intento, responder, finalizar, ver resultado propio.

## Actualizacion Docker tras cambios
1. `docker compose build api`
2. `docker compose up -d api`
3. `curl -f http://localhost:4000/health`
4. `curl -f http://localhost:4000/health/ready`
5. `docker compose logs api --tail=80`

## Pendientes tecnicos reales
- E2E automatizado multirol (admin/docente/estudiante) en navegador real.
- Pipeline de importacion nacional con dataset oficial estable y versionado por fecha.
- Politica formal de revision humana para publicar preguntas IA.
- Observabilidad centralizada (errores UI + API + latencia DB) con alertas.
- Prueba controlada en aula real con 50 equipos simultaneos y metricas comparativas (p50/p95 por endpoint).
