# Project Continuity Guide

## Estado consolidado (hasta `88294ac`)
- `343f4b1`: hardening IA, importador Magdalena, reset seguro base.
- `40a955e`: UI admin/docente responsive + simulador enfocado + revision IA.
- `5f1a052`: checklist de release para despliegue.
- `88294ac`: manejo JSON malformado retorna `400 INVALID_JSON`.

## Errores cerrados
- Ruta legacy `/api/attempts/public/*` retirada del flujo activo del portal estudiante.
- `PATCH /api/questions/:id/ai-status` con JSON invalido ya no responde `500`.
- Permisos backend reforzados:
  - `ADMIN` alcance global.
  - `DOCENTE` filtrado por scope backend/API.
  - `ESTUDIANTE` aislado a `/api/student/*`.

## Comandos seguros (operacion diaria)
- Build API: `docker compose build api`
- Levantar servicios: `docker compose up -d`
- Health: `curl -f http://localhost:4000/health`
- Ready: `curl -f http://localhost:4000/health/ready`
- Prisma validate: `docker compose run --rm api npx prisma validate`
- Prisma generate: `docker compose run --rm api npx prisma generate`
- Build TS: `docker compose run --rm api npm run build`
- Integracion: `docker compose run --rm api npm run test:integration`

## Comandos prohibidos en produccion
- `npx prisma migrate reset`
- `npm run db:reset:dev`
- `npm run db:reset:clean`
- `npm run db:prepare:demo`
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

## Importacion colegios Colombia
- Dry-run: `npm run seed:colegios:colombia:dry`
- Apply: `npm run seed:colegios:colombia`
- Por departamento: `npm run seed:colegios:colombia -- --departamento=MAGDALENA`
- Desde CSV: `npm run seed:colegios:colombia -- --source=csv --csv=storage/materiales_apoyo/colegios_colombia.csv`

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
