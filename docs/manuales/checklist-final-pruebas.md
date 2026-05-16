# Checklist final de pruebas (imprimible)

## Servidor
- [ ] Equipo encendido y conectado a energia.
- [ ] Docker Desktop activo.
- [ ] `api`, `db`, `ollama` arriba.
- [ ] Health OK.
- [ ] Ready OK.

## Red
- [ ] IP LAN confirmada.
- [ ] Puerto 4000 habilitado en red privada.
- [ ] Otro PC abre `/health`.

## Catalogo y usuarios
- [ ] Departamentos cargan en formulario.
- [ ] MAGDALENA -> SANTA MARTA funciona.
- [ ] PALOMINITO se encuentra por busqueda.
- [ ] DOCENTE creado con alcance de colegio.
- [ ] ESTUDIANTE creado con colegio/salon.

## Flujo por rol
- [ ] ADMIN: dashboard, reportes, operacion y monitoreo.
- [ ] DOCENTE: solo alcance permitido.
- [ ] ESTUDIANTE: iniciar, responder, finalizar y ver resultado propio.

## Responsive
- [ ] Admin usable en portatil y movil.
- [ ] Simulador usable en movil.
- [ ] Sin overflow horizontal critico.

## Seguridad
- [ ] DOCENTE sin acceso a operacion del sistema.
- [ ] ESTUDIANTE aislado en su portal.
- [ ] Sin acciones destructivas durante simulacro.

## Post-simulacro
- [ ] Revisar incidencias.
- [ ] Revisar logs.
- [ ] Guardar evidencia operativa.
