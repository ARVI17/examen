# Operacion Local/LAN (Servidor en este PC)

## Alcance
- Este equipo opera como servidor local/LAN (no expuesto a internet).
- Frontend servido desde `api/public`.
- Servicios esperados: `api`, `db`, `ollama`.

## Guias para usuario final
- Manual ADMIN: `docs/manuales/manual-admin.md`
- Manual DOCENTE: `docs/manuales/manual-docente.md`
- Manual ESTUDIANTE: `docs/manuales/manual-estudiante.md`
- Guia de simulacro: `docs/manuales/guia-simulacro.md`
- Solucion de problemas: `docs/manuales/guia-solucion-problemas.md`
- Checklist final: `docs/manuales/checklist-final-pruebas.md`

## URLs de acceso
1. Obtener IP LAN del servidor:
   - PowerShell:
     - `Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | Select-Object InterfaceAlias,IPAddress`
2. Usar IP LAN detectada (ejemplo `192.168.1.25`):
   - Admin: `http://192.168.1.25:4000/admin/`
   - Simulador: `http://192.168.1.25:4000/simulador/`
   - Health: `http://192.168.1.25:4000/health`
   - Ready: `http://192.168.1.25:4000/health/ready`

## Runtime LAN requerido
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=4000`
- `CORS_ORIGINS` debe incluir al menos:
  - `http://localhost:4000`
  - `http://127.0.0.1:4000`
  - `http://<IP_LAN>:4000`

## Firewall (Windows)
1. Verificar regla:
   - `Get-NetFirewallRule | Where-Object { $_.DisplayName -like '*Saber11*4000*' } | Select-Object DisplayName,Enabled,Direction,Action`
2. Si no existe, crear (PowerShell Admin):
   - `New-NetFirewallRule -DisplayName "Saber11 API 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private`

## Operacion diaria
- Levantar:
  - `docker compose up -d`
- Estado:
  - `docker compose ps`
- Logs API:
  - `docker compose logs api --tail=100`
- Detener:
  - `docker compose down`

## Prueba de carga LAN (no destructiva)
- Script controlado:
  - `npm run test:lan-load`
- Variante desde contenedor:
  - `docker compose run --rm api npm run test:lan-load`
- Parametros opcionales:
  - `LAN_LOAD_BASE_URL=http://api:4000`
  - `LAN_LOAD_CONCURRENCY=5,10,25,50`
  - `LAN_LOAD_DURATION_MS=15000`
- Endpoints evaluados (solo lectura):
  - `/health`, `/health/ready`, `/admin/`, `/simulador/`, `/connection-info`
- Reglas:
  - no ejecutar importaciones, backups ni preparacion local durante la carga
  - revisar `docker compose logs api --tail=100` al finalizar

## Operacion web (solo ADMIN)
- Abrir `http://<IP_LAN>:4000/admin/` y entrar a la seccion **Operacion del sistema**.
- Funciones disponibles desde UI:
  - Estado general/LAN/health.
  - Centro **Monitoreo del simulacro** (estado rapido, semaforo, recordatorios y comandos copiable solo texto).
  - Dry-run de importacion de colegios.
  - Apply de importacion (con confirmacion exacta y prerequisitos).
  - Backup (ejecucion o asistente).
  - Preparacion local guiada (asistente o ejecucion controlada).
  - Checklist de pruebas reales y operaciones recientes.
- Bloqueos de seguridad:
  - Solo rol `ADMIN`.
  - DOCENTE y ESTUDIANTE no pueden acceder.
  - Sin comandos libres ni terminal web.
  - Sin exposicion de secretos.

### Creacion de usuarios/estudiantes con catalogo nacional
- En formularios de admin se usa flujo encadenado:
  - `Departamento -> Municipio -> Colegio`
- Validacion funcional recomendada:
  - `MAGDALENA -> SANTA MARTA -> PALOMINITO`

### Uso del Centro de monitoreo LAN (dia de simulacro)
- Revisar semaforo:
  - Verde: iniciar prueba.
  - Amarillo: corregir advertencias antes de iniciar.
  - Rojo: no iniciar hasta resolver API/DB/ready.
- Copiar desde UI:
  - URL simulador para estudiantes.
  - URL admin para apoyo tecnico.
  - URL health y ready para diagnostico rapido.
- Seguir checklist:
  - Antes: red, firewall, carga del servidor, prueba escalonada.
  - Durante: no ejecutar importaciones/backups/IA pesada.
  - Despues: revisar resultados y logs, generar backup posterior si aplica.

## Backup previo obligatorio (antes de migraciones/import/reset)
- Host con `DATABASE_URL`:
  - `pg_dump "$DATABASE_URL" > backup_YYYYMMDD_HHMMSS.sql`
- Verificar archivo:
  - `ls -lh backup_YYYYMMDD_HHMMSS.sql`

## Importacion colegios Colombia (controlada)
- Dry-run:
  - `npm run seed:colegios:colombia:dry -- --limit=50`
- Dry-run filtrado:
  - `npm run seed:colegios:colombia:dry -- --departamento=MAGDALENA --municipio="SANTA MARTA" --search=PALOMINITO --limit=5000`
- Apply en production local (solo con confirmacion):
  - `LOCAL_PRODUCTION_PREPARE=true npm run seed:colegios:colombia -- --apply --confirm-local-production`
  - PowerShell:
    - `$env:LOCAL_PRODUCTION_PREPARE='true'; npm run seed:colegios:colombia -- --apply --confirm-local-production`

## Preparacion desde cero (solo local/LAN controlado)
- No ejecutar sin backup.
- No ejecutar si ya hay datos definitivos.
- Dry-run:
  - `LOCAL_PRODUCTION_PREPARE=true npm run db:prepare:local-production:dry`
- Apply:
  - `LOCAL_PRODUCTION_PREPARE=true npm run db:prepare:local-production -- --backup-file=backup_YYYYMMDD_HHMMSS.sql --confirm-local-production-reset --with-ai=true --ai-count=5`
  - PowerShell:
  - `$env:LOCAL_PRODUCTION_PREPARE='true'; npm run db:prepare:local-production -- --backup-file=backup_YYYYMMDD_HHMMSS.sql --confirm-local-production-reset --with-ai=true --ai-count=5`

## Limpieza controlada de datos de usuario (sin tocar colegios)
- Uso recomendado antes de una nueva jornada real cuando se desea conservar catalogo de colegios:
  1. Crear backup SQL.
  2. Ejecutar dry-run:
     - `$env:LOCAL_PRODUCTION_PREPARE='true'; npm run db:clean:user-data -- --dry-run --keep-admin=true --backup-file=storage/backups/manual/backup_YYYYMMDD_HHMMSS.sql`
  3. Ejecutar apply con confirmacion exacta:
     - `$env:LOCAL_PRODUCTION_PREPARE='true'; npm run db:clean:user-data -- --confirm='LIMPIAR DATOS USUARIOS' --keep-admin=true --backup-file=storage/backups/manual/backup_YYYYMMDD_HHMMSS.sql`
- Garantias:
  - conserva usuarios ADMIN
  - conserva estructura y migraciones
  - elimina intentos/respuestas/resultados/asignaciones de pruebas previas
  - requiere backup-file existente

## Comandos prohibidos en produccion local
- `npx prisma migrate reset`
- `npm run db:reset:dev`
- `npm run db:reset:clean` (sin flujo controlado local)
- `prisma db push`
- Seeds masivos o publicacion IA automatica sin revision humana

## Smoke test LAN (otro PC)
- Admin:
  - abrir `/admin`, login, dashboard, filtros de colegios, revision IA
- Docente:
  - login, alcance restringido por backend
- Estudiante:
  - abrir `/simulador`, iniciar intento, responder, finalizar, ver resultado propio
- API:
  - `/health` y `/health/ready` en `http://<IP_LAN>:4000`

## Recuperacion de intento estudiante (cortes/red)
- El simulador muestra estado de sincronizacion (`Guardando`, `Guardado`, `Pendiente por sincronizar`, `Sin conexion`).
- Si se pierde red:
  - las respuestas se encolan localmente
  - al reconectar, se sincronizan al servidor
- Si se recarga la pagina:
  - se restaura estado local temporal
  - se reconcilia con el intento activo del servidor
- Si cambia de equipo:
  - iniciar sesion nuevamente
  - continuar intento activo desde servidor
- Regla operativa: el servidor es la fuente principal; el navegador es respaldo temporal.

## Diagnostico rapido: pantalla oscura en /admin
- Si aparece overlay/backdrop bloqueando la UI:
  1. Refrescar `Ctrl+F5`.
  2. Cerrar modales abiertos y presionar `Esc`.
  3. Revisar que no haya operaciones pendientes en seccion Operacion del sistema.
  4. Verificar que el contenedor `api` corresponda al ultimo build:
     - `docker compose build api`
     - `docker compose up -d api`
  5. Revisar logs:
     - `docker compose logs api --tail=100`

## Checklist rapido para 50 equipos LAN
- Servidor por cable Ethernet (no WiFi).
- IP fija o reserva DHCP en router.
- Puerto 4000 abierto solo en perfil privado.
- No ejecutar tareas pesadas (import/backup/IA) durante simulacro.
- Validar primero con 10 equipos, luego 25, luego 50.

## Troubleshooting rapido
- No conecta otro PC:
  - validar misma red LAN
  - validar IP actual del servidor
  - validar firewall perfil `Private`
  - validar `HOST=0.0.0.0`
  - validar `docker compose ps` y puerto `4000:4000`
- CORS:
  - actualizar `CORS_ORIGINS` para incluir `http://<IP_LAN>:4000`
- IP cambia por DHCP:
  - reservar IP fija en router para este equipo

## Seguridad de red
- Mantener red en perfil privado.
- No abrir puertos en router.
- No exponer servicio a internet.
